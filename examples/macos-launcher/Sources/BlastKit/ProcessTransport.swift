import Foundation

/// Runs `node <servePath>` and speaks the embedder protocol over its stdio.
///
/// `node` is found through `/usr/bin/env` so the caller's `PATH` decides which
/// Node.js runs; `servePath` is absolute or relative to `workingDirectory`.
public final class ProcessTransport: BlastTransport, @unchecked Sendable {
    public static let defaultServePath = "packages/serve/src/main.ts"

    public struct Configuration: Sendable {
        public var nodeExecutable: String
        public var servePath: String
        public var arguments: [String]
        public var workingDirectory: URL?
        /// Replaces the inherited environment when set (tests point data at a temp dir).
        public var environment: [String: String]?
        public var maxLineBytes: Int

        public init(
            servePath: String = ProcessTransport.defaultServePath,
            nodeExecutable: String = "node",
            arguments: [String] = [],
            workingDirectory: URL? = nil,
            environment: [String: String]? = nil,
            maxLineBytes: Int = NDJSONFramer.defaultMaxLineBytes
        ) {
            self.servePath = servePath
            self.nodeExecutable = nodeExecutable
            self.arguments = arguments
            self.workingDirectory = workingDirectory
            self.environment = environment
            self.maxLineBytes = maxLineBytes
        }
    }

    private let configuration: Configuration
    private let process = Process()
    private let standardInput = Pipe()
    private let standardOutput = Pipe()
    private let lock = NSLock()
    private var running = false

    public init(configuration: Configuration = Configuration()) {
        self.configuration = configuration
    }

    public convenience init(
        servePath: String = ProcessTransport.defaultServePath,
        nodeExecutable: String = "node",
        arguments: [String] = [],
        workingDirectory: URL? = nil,
        environment: [String: String]? = nil
    ) {
        self.init(
            configuration: Configuration(
                servePath: servePath,
                nodeExecutable: nodeExecutable,
                arguments: arguments,
                workingDirectory: workingDirectory,
                environment: environment
            )
        )
    }

    public func start(
        onLine: @escaping @Sendable (Data) -> Void,
        onError: @escaping @Sendable (BlastError) -> Void,
        onExit: @escaping @Sendable (Error?) -> Void
    ) throws {
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [configuration.nodeExecutable, configuration.servePath] + configuration.arguments
        if let directory = configuration.workingDirectory {
            process.currentDirectoryURL = directory
        }
        if let environment = configuration.environment {
            process.environment = environment
        }
        process.standardInput = standardInput
        process.standardOutput = standardOutput
        process.standardError = FileHandle.standardError

        try process.run()
        lock.lock()
        running = true
        lock.unlock()

        DispatchQueue.global(qos: .userInitiated).async { [self] in
            readLoop(onLine: onLine, onError: onError, onExit: onExit)
        }
    }

    public func send(_ data: Data) throws {
        var line = data
        line.append(0x0A)
        try standardInput.fileHandleForWriting.write(contentsOf: line)
    }

    /// Closes stdin (the server's own shutdown path) and terminates if needed.
    public func close() {
        lock.lock()
        let wasRunning = running
        running = false
        lock.unlock()
        try? standardInput.fileHandleForWriting.close()
        if wasRunning && process.isRunning {
            process.terminate()
        }
    }

    private func readLoop(
        onLine: @escaping @Sendable (Data) -> Void,
        onError: @escaping @Sendable (BlastError) -> Void,
        onExit: @escaping @Sendable (Error?) -> Void
    ) {
        var framer = NDJSONFramer(maxLineBytes: configuration.maxLineBytes)
        let handle = standardOutput.fileHandleForReading
        // `availableData` blocks until a chunk (or EOF) arrives; unlike
        // `read(upToCount:)` it returns as soon as any bytes are ready, which is
        // what request/response latency depends on.
        while true {
            let chunk = handle.availableData
            if chunk.isEmpty { break }
            for event in framer.append(chunk) {
                switch event {
                case .line(let line): onLine(line)
                case .oversizedLine(let limit): onError(.lineTooLarge(limit: limit))
                }
            }
        }
        for event in framer.finish() {
            switch event {
            case .line(let line): onLine(line)
            case .oversizedLine(let limit): onError(.lineTooLarge(limit: limit))
            }
        }

        process.waitUntilExit()
        lock.lock()
        let wasRunning = running
        running = false
        lock.unlock()
        let status = process.terminationStatus
        if !wasRunning || status == 0 {
            onExit(nil)
        } else {
            onExit(BlastError.transport("serve exited with status \(status)"))
        }
    }
}
