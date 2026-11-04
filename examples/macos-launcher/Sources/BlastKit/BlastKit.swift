import Foundation

public enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .null: try c.encodeNil(); case .bool(let v): try c.encode(v); case .number(let v): try c.encode(v); case .string(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v) }
    }
}

public struct EmbedderError: Codable, Equatable, Sendable, Error {
    public let code: String; public let message: String; public let data: JSONValue?
    public init(code: String, message: String, data: JSONValue? = nil) { self.code = code; self.message = message; self.data = data }
}
public enum BlastError: Error, Equatable, Sendable {
    case transport(String), malformedLine(String), lineTooLarge, versionMismatch(Int), remote(EmbedderError)
}

public protocol BlastTransport: AnyObject {
    func start(onLine: @escaping (Data) -> Void, onExit: @escaping (Error?) -> Void) throws
    func send(_ data: Data) throws
    func close()
}

public final class NDJSONDecoder {
    private var buffer = Data(); private let maxLineBytes: Int
    public init(maxLineBytes: Int = 8 << 20) { self.maxLineBytes = maxLineBytes }
    public func append(_ data: Data) throws -> [Data] {
        buffer.append(data); var result: [Data] = []
        while let range = buffer.firstRange(of: Data([10])) {
            let line = buffer.subdata(in: 0..<range.lowerBound); buffer.removeSubrange(0...range.lowerBound)
            guard line.count <= maxLineBytes else { throw BlastError.lineTooLarge }; if !line.isEmpty { result.append(line) }
        }
        guard buffer.count <= maxLineBytes else { throw BlastError.lineTooLarge }; return result
    }
    public func finish() throws -> [Data] { guard buffer.isEmpty else { guard buffer.count <= maxLineBytes else { throw BlastError.lineTooLarge }; let line=buffer; buffer.removeAll(); return [line] }; return [] }
}

public final class ProcessTransport: BlastTransport {
    private let process: Process; private let input: Pipe; private let output: Pipe; private let maxLineBytes: Int
    public init(nodePath: String = "node", servePath: String = "packages/serve/src/main.ts", arguments: [String] = [], maxLineBytes: Int = 8 << 20) {
        process = Process(); input = Pipe(); output = Pipe(); self.maxLineBytes = maxLineBytes
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [servePath] + arguments
        process.standardInput = input; process.standardOutput = output; process.standardError = FileHandle.standardError
    }
    public func start(onLine: @escaping (Data) -> Void, onExit: @escaping (Error?) -> Void) throws {
        try process.run()
        let handle = output.fileHandleForReading
        DispatchQueue.global().async {
            var buffer = Data()
            do {
                while true {
                    let chunk = try handle.read(upToCount: 64 * 1024) ?? Data()
                    if chunk.isEmpty { break }
                    buffer.append(chunk)
                    while let range = buffer.firstRange(of: Data([10])) {
                        let line = buffer.subdata(in: 0..<range.lowerBound); buffer.removeSubrange(0...range.lowerBound)
                        guard line.count <= self.maxLineBytes else { onExit(BlastError.lineTooLarge); return }
                        if !line.isEmpty { onLine(line) }
                    }
                    if buffer.count > self.maxLineBytes { onExit(BlastError.lineTooLarge); return }
                }
                if !buffer.isEmpty { onLine(buffer) }
                onExit(nil)
            } catch { onExit(error) }
        }
    }
    public func send(_ data: Data) throws { try input.fileHandleForWriting.write(contentsOf: data); try input.fileHandleForWriting.write(contentsOf: Data([10])) }
    public func close() { process.terminate() }
}

public enum ControllerInput: Codable, Equatable, Sendable {
    case search(String), actionsQuery(String), dropdownQuery(String)
    case move(String), select(String), focus(String), toggle(String), setValue(id: String, value: String), optionMove(Double)
    case primary, openActions, closeActions, focusNext, focusPrev, optionChoose, submit, back, openDropdown, chooseDropdown
    case key(KeyInput), toastAction(Int), alert(confirm: Bool, remember: Bool?)
    public struct KeyInput: Codable, Equatable, Sendable { public let name: String; public var ctrl: Bool?; public var meta: Bool?; public var shift: Bool?; public var option: Bool?; public var `super`: Bool?; public init(name: String, ctrl: Bool? = nil, meta: Bool? = nil, shift: Bool? = nil, option: Bool? = nil, superValue: Bool? = nil) { self.name=name; self.ctrl=ctrl; self.meta=meta; self.shift=shift; self.option=option; self.super=superValue } }
    enum CodingKeys: String, CodingKey { case type, text, direction, id, value, delta, key, index, confirm, remember }
    public init(from decoder: Decoder) throws { let c=try decoder.container(keyedBy:CodingKeys.self); let t=try c.decode(String.self,forKey:.type); switch t {
        case "search": self = .search(try c.decode(String.self,forKey:.text)); case "actionsQuery": self = .actionsQuery(try c.decode(String.self,forKey:.text)); case "dropdownQuery": self = .dropdownQuery(try c.decode(String.self,forKey:.text)); case "move": self = .move(try c.decode(String.self,forKey:.direction)); case "select": self = .select(try c.decode(String.self,forKey:.id)); case "focus": self = .focus(try c.decode(String.self,forKey:.id)); case "toggle": self = .toggle(try c.decode(String.self,forKey:.id)); case "setValue": self = .setValue(id: try c.decode(String.self,forKey:.id), value: try c.decode(String.self,forKey:.value)); case "optionMove": self = .optionMove(try c.decode(Double.self,forKey:.delta)); case "key": self = .key(try c.decode(KeyInput.self,forKey:.key)); case "toastAction": self = .toastAction(try c.decode(Int.self,forKey:.index)); case "alert": self = .alert(confirm: try c.decode(Bool.self,forKey:.confirm), remember: try c.decodeIfPresent(Bool.self,forKey:.remember)); case "primary": self = .primary; case "openActions": self = .openActions; case "closeActions": self = .closeActions; case "focusNext": self = .focusNext; case "focusPrev": self = .focusPrev; case "optionChoose": self = .optionChoose; case "submit": self = .submit; case "back": self = .back; case "openDropdown": self = .openDropdown; case "chooseDropdown": self = .chooseDropdown; default: throw DecodingError.dataCorruptedError(forKey:.type,in:c,debugDescription:"unknown input \(t)") }
    }
    public func encode(to encoder: Encoder) throws { var c=encoder.container(keyedBy:CodingKeys.self); switch self { case .search(let v): try c.encode("search",forKey:.type); try c.encode(v,forKey:.text); case .actionsQuery(let v): try c.encode("actionsQuery",forKey:.type); try c.encode(v,forKey:.text); case .dropdownQuery(let v): try c.encode("dropdownQuery",forKey:.type); try c.encode(v,forKey:.text); case .move(let v): try c.encode("move",forKey:.type); try c.encode(v,forKey:.direction); case .select(let v): try c.encode("select",forKey:.type); try c.encode(v,forKey:.id); case .focus(let v): try c.encode("focus",forKey:.type); try c.encode(v,forKey:.id); case .toggle(let v): try c.encode("toggle",forKey:.type); try c.encode(v,forKey:.id); case .setValue(let id,let value): try c.encode("setValue",forKey:.type); try c.encode(id,forKey:.id); try c.encode(value,forKey:.value); case .optionMove(let v): try c.encode("optionMove",forKey:.type); try c.encode(v,forKey:.delta); case .key(let v): try c.encode("key",forKey:.type); try c.encode(v,forKey:.key); case .toastAction(let v): try c.encode("toastAction",forKey:.type); try c.encode(v,forKey:.index); case .alert(let confirm,let remember): try c.encode("alert",forKey:.type); try c.encode(confirm,forKey:.confirm); try c.encodeIfPresent(remember,forKey:.remember); default: let t: String = switch self { case .primary:"primary";case .openActions:"openActions";case .closeActions:"closeActions";case .focusNext:"focusNext";case .focusPrev:"focusPrev";case .optionChoose:"optionChoose";case .submit:"submit";case .back:"back";case .openDropdown:"openDropdown";case .chooseDropdown:"chooseDropdown";default:"" }; try c.encode(t,forKey:.type) } }
}

public struct ControllerView: Codable, Equatable, Sendable {
    public struct Search: Codable, Equatable, Sendable { public var text=""; public var placeholder="" }
    public struct Navigation: Codable, Equatable, Sendable { public var canGoBack=false }
    public struct Row: Codable, Equatable, Sendable { public var id=""; public var kind=""; public var title=""; public var subtitle=""; public var accessories=""; public var icon=false; public var count:Int?; public var selected=false; public var iconLabel=""; public var iconTint:String?; public var text="" }
    public struct GridCell: Codable, Equatable, Sendable { public var id=""; public var title=""; public var subtitle=""; public var content=""; public var selected=false }
    public struct GridRow: Codable, Equatable, Sendable { public var id:String?; public var header=""; public var cells:[GridCell]=[] }
    public struct ActionRow: Codable, Equatable, Sendable { public var id=""; public var kind=""; public var title=""; public var shortcut=""; public var selected=false }
    public struct Actions: Codable, Equatable, Sendable { public var open=false; public var title=""; public var query=""; public var breadcrumb:[String]=[]; public var rows:[ActionRow]=[]; public var selectedIndex = -1 }
    public struct Feedback: Codable, Equatable, Sendable { public struct Toast: Codable, Equatable, Sendable { public var style=""; public var title=""; public var message=""; public var actions:[ActionRow]=[] }; public var toast:Toast?; public var hud:JSONValue?; public var alert:JSONValue? }
    public struct MenuBar: Codable, Equatable, Sendable { public var title=""; public var tooltip=""; public var loading=false; public var path:[String]=[]; public var rows:[ActionRow]=[]; public var selectedId:String? }
    public var kind="empty"; public var title=""; public var navigation=Navigation(); public var loading=false; public var search=Search(); public var rows:[Row]=[]; public var grid:[GridRow]?; public var selectedId:String?; public var emptyText=""; public var empty:JSONValue?; public var detail=""; public var primary:ActionRow=ActionRow(); public var actions=Actions(); public var dropdown:JSONValue?; public var feedback=Feedback(); public var menuBar:MenuBar?; public var form:JSONValue?; public var requests:JSONValue?
}

public enum BlastEvent: Equatable, Sendable { case view(session:String, view:ControllerView); case generic(name:String, payload:[String:JSONValue]); case exited(session:String, code:Int?, error:EmbedderError?); case capabilityCancelled(id:String) }
public protocol CapabilityHandler: AnyObject { func handle(name: String, session: String, params: JSONValue) async throws -> JSONValue }

public final class BlastClient: @unchecked Sendable {
    public let transport: BlastTransport; public var onEvent: ((BlastEvent) -> Void)?; public var capabilityHandler: CapabilityHandler?
    private var nextID=0; private var pending:[String: CheckedContinuation<JSONValue,Error>] = [:]; private var welcomeWaiter: CheckedContinuation<JSONValue, Error>?; private let lock=NSLock(); private var welcomed=false
    public init(transport: BlastTransport, capabilityHandler: CapabilityHandler? = nil) { self.transport=transport; self.capabilityHandler=capabilityHandler }
    public func start(capabilities:[String] = []) async throws {
        try transport.start(onLine: { [weak self] in self?.receive($0) }, onExit: { [weak self] error in if let error { self?.failAll(error) } })
        let hello = try JSONEncoder().encode(JSONValue.object(["type":.string("hello"), "protocol":.number(1), "capabilities":.array(capabilities.map(JSONValue.string))]))
        _ = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<JSONValue, Error>) in
            lock.lock(); welcomeWaiter = continuation; lock.unlock()
            do { try transport.send(hello) } catch { continuation.resume(throwing: error) }
        }
        welcomed=true
    }
    public func request(method:String, params:[String:JSONValue] = [:]) async throws -> JSONValue { try await send(method:method,payload:["type":.string("request"),"method":.string(method),"params":.object(params)]) }
    public func sendInput(session:String,input:ControllerInput) async throws { let data=try JSONEncoder().encode(input); let json=try JSONSerialization.jsonObject(with:data) as! [String:Any]; try await request(method:"session.input",params:["session":.string(session),"input":Self.value(json)]) }
    private func send(method:String?, payload:[String:JSONValue]) async throws -> JSONValue { var p=payload; if let method { nextID += 1; p["id"] = .string(String(nextID)); p["method"] = .string(method) }; let data=try JSONEncoder().encode(JSONValue.object(p)); let id=(p["id"].flatMap { if case .string(let v)=$0{return v};return nil }); return try await withCheckedThrowingContinuation { (c: CheckedContinuation<JSONValue,Error>) in lock.lock(); if let id { pending[id]=c }; lock.unlock(); do { try transport.send(data) } catch { if let id { lock.lock(); pending.removeValue(forKey:id); lock.unlock() }; c.resume(throwing:error) } } }
    private func receive(_ data:Data) { do { let v=try JSONDecoder().decode(JSONValue.self,from:data); guard case .object(let o)=v, case .string(let type)=o["type"] else { throw BlastError.malformedLine("message must be object") }; switch type {
        case "welcome":
            guard case .number(let p)=o["protocol"] else { throw BlastError.malformedLine("welcome protocol") }
            if Int(p) != 1 { let error = BlastError.versionMismatch(Int(p)); welcomeWaiter?.resume(throwing: error); welcomeWaiter=nil; failAll(error); return }
            welcomeWaiter?.resume(returning: v); welcomeWaiter=nil
        case "response":
            guard case .string(let id)=o["id"] else { throw BlastError.malformedLine("response id") }
            if case .bool(true)=o["ok"] { resume(id:id,value:o["result"] ?? .null) }
            else if case .object(let e)=o["error"], case .string(let code)=e["code"], case .string(let message)=e["message"] { resume(id:id,error:BlastError.remote(EmbedderError(code:code,message:message,data:e["data"]))) }
        case "event":
            if case .string(let event)=o["event"] { if event == "session.view", case .string(let s)=o["session"], let viewData=o["view"], let d=try? JSONEncoder().encode(viewData), let view=try? JSONDecoder().decode(ControllerView.self,from:d) { onEvent?(.view(session:s,view:view)) } else { onEvent?(.generic(name:event,payload:o)) } }
        case "capability.request": handleCapability(o)
        case "capability.cancel": if case .string(let id)=o["id"] { onEvent?(.capabilityCancelled(id:id)) }
        case "error": if case .object(let e)=o["error"],case .string(let code)=e["code"],case .string(let message)=e["message"] { let error=BlastError.remote(EmbedderError(code:code,message:message,data:e["data"])); welcomeWaiter?.resume(throwing:error); welcomeWaiter=nil; failAll(error) }
        default: throw BlastError.malformedLine("unknown type \(type)")
        } } catch { welcomeWaiter?.resume(throwing:error); welcomeWaiter=nil; failAll(error) } }
    private func resume(id:String?,value:JSONValue?=nil,error:Error?=nil) { guard let id else { return }; lock.lock(); let c=pending.removeValue(forKey:id); lock.unlock(); if let c { if let error { c.resume(throwing:error) } else { c.resume(returning:value ?? .null) } } }
    private func failAll(_ error:Error) { lock.lock(); let values=pending.values; pending.removeAll(); lock.unlock(); for c in values { c.resume(throwing:error) } }
    private func handleCapability(_ o:[String:JSONValue]) {
        guard case .string(let id)=o["id"], case .string(let session)=o["session"], case .string(let name)=o["name"] else { return }
        let params=o["params"] ?? .null
        Task {
            do {
                guard let handler=self.capabilityHandler else { throw EmbedderError(code:"unhandled_capability",message:"No handler for \(name)") }
                let value=try await handler.handle(name:name,session:session,params:params)
                let message=JSONValue.object(["type":.string("capability.result"),"id":.string(id),"ok":.bool(true),"value":value])
                try? self.transport.send(try JSONEncoder().encode(message))
            } catch {
                let e=(error as? EmbedderError) ?? EmbedderError(code:"capability_failed",message:String(describing:error))
                let message=JSONValue.object(["type":.string("capability.result"),"id":.string(id),"ok":.bool(false),"error":.object(["code":.string(e.code),"message":.string(e.message)])])
                try? self.transport.send(try JSONEncoder().encode(message))
            }
        }
    }
    private static func value(_ x:Any)->JSONValue { if x is NSNull{return .null}; if let x=x as? String{return .string(x)}; if let x=x as? Bool{return .bool(x)}; if let x=x as? NSNumber{return .number(x.doubleValue)}; if let x=x as? [Any]{return .array(x.map(value))}; if let x=x as? [String:Any]{return .object(x.mapValues(value))}; return .null }
}
