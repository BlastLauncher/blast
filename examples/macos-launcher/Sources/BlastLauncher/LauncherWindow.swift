import AppKit
import BlastKit
import BlastPresenter

@MainActor
public final class LauncherWindowController: NSWindowController, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    public let presenter: LauncherPresenter
    public let searchField = NSSearchField(frame: .zero)
    public let tableView = NSTableView(frame: .zero)
    public let actionPanelView = NSBox(frame: .zero)
    public let detailTextView = NSTextView(frame: .zero)
    public let toastLabel = NSTextField(labelWithString: "")
    public private(set) var display: LauncherDisplay = .commandPicker
    public var onInput: ((ControllerInput) -> Void)?
    public var onCommandSelected: ((String) -> Void)?

    private let titleLabel = NSTextField(labelWithString: "")
    private let emptyLabel = NSTextField(wrappingLabelWithString: "")
    private let primaryLabel = NSTextField(labelWithString: "")
    private let actionLabel = NSTextField(labelWithString: "")
    private let content: LauncherContentView

    public init(presenter: LauncherPresenter = LauncherPresenter()) {
        self.presenter = presenter
        self.content = LauncherContentView(frame: .zero)
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 680, height: 480), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: true)
        panel.isReleasedWhenClosed = false
        super.init(window: panel)
        panel.title = "Blast Launcher"
        panel.contentView = content
        configure()
        render(presenter.display)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func configure() {
        guard let window, let root = window.contentView else { return }
        root.wantsLayer = true
        searchField.placeholderString = "Search…"
        searchField.delegate = self
        searchField.target = self
        searchField.action = #selector(searchEdited)
        titleLabel.font = .boldSystemFont(ofSize: 18)
        primaryLabel.alignment = .right
        emptyLabel.alignment = .center
        emptyLabel.textColor = .secondaryLabelColor
        detailTextView.isEditable = false
        detailTextView.isSelectable = true
        detailTextView.drawsBackground = false
        toastLabel.textColor = .systemBlue
        actionPanelView.titlePosition = .noTitle
        actionPanelView.fillColor = .windowBackgroundColor
        actionPanelView.borderType = .lineBorder
        actionLabel.font = .boldSystemFont(ofSize: 14)
        let column = NSStackView(views: [titleLabel, searchField, tableView, detailTextView, emptyLabel, actionPanelView, toastLabel, primaryLabel])
        column.orientation = .vertical; column.spacing = 8; column.edgeInsets = NSEdgeInsets(top: 16, left: 18, bottom: 16, right: 18)
        root.addSubview(column); column.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: root.leadingAnchor), column.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            column.topAnchor.constraint(equalTo: root.topAnchor), column.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            searchField.heightAnchor.constraint(equalToConstant: 28), tableView.heightAnchor.constraint(greaterThanOrEqualToConstant: 120),
            detailTextView.heightAnchor.constraint(greaterThanOrEqualToConstant: 120), actionPanelView.heightAnchor.constraint(greaterThanOrEqualToConstant: 60),
        ])
        let columnView = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("main")); tableView.addTableColumn(columnView)
        tableView.headerView = nil; tableView.dataSource = self; tableView.delegate = self; tableView.usesAlternatingRowBackgroundColors = true
        tableView.selectionHighlightStyle = .regular
        content.onKey = { [weak self] key in self?.handle(key) }
    }

    public func render(_ display: LauncherDisplay) {
        self.display = display
        titleLabel.stringValue = display.title
        searchField.placeholderString = display.searchPlaceholder
        if searchField.stringValue != display.searchText { searchField.stringValue = display.searchText }
        titleLabel.isHidden = display.title.isEmpty
        tableView.isHidden = true; detailTextView.isHidden = true; emptyLabel.isHidden = true
        switch display.body {
        case .loading: emptyLabel.stringValue = "Loading…"; emptyLabel.isHidden = false
        case .empty(let title, let description): emptyLabel.stringValue = description.isEmpty ? title : "(title)\n(description)"; emptyLabel.isHidden = false
        case .rows(let rows): tableView.isHidden = false; tableView.reloadData(); if let index = display.selectedRowIndex, index < rows.count { tableView.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false); tableView.scrollRowToVisible(index) }
        case .detail(let markdown): detailTextView.isHidden = false; detailTextView.textStorage?.setAttributedString(Self.markdown(markdown))
        }
        actionPanelView.isHidden = !display.actionsOpen
        actionLabel.stringValue = display.actionsTitle + (display.actions.isEmpty ? "" : "\n" + display.actions.map { $0.title + ($0.shortcut.isEmpty ? "" : "  " + $0.shortcut) }.joined(separator: "\n"))
        actionPanelView.contentView = actionLabel
        toastLabel.stringValue = display.toast.map { [$0.title, $0.message].filter { !$0.isEmpty }.joined(separator: ": ") } ?? ""
        primaryLabel.stringValue = display.primaryEnabled ? "\(display.primaryTitle)  \(display.primaryShortcut)" : ""
    }

    private static func markdown(_ value: String) -> NSAttributedString {
        // Foundation's markdown document importer is not available on every
        // headless runner. Preserve the source in an attributed text view and
        // apply the one presentation distinction that matters for a launcher.
        let result = NSMutableAttributedString(string: value)
        let fullRange = NSRange(location: 0, length: result.length)
        result.addAttribute(.font, value: NSFont.systemFont(ofSize: NSFont.systemFontSize), range: fullRange)
        for line in value.split(separator: "\n", omittingEmptySubsequences: false) where line.hasPrefix("#") {
            let text = String(line)
            if let range = value.range(of: text) { result.addAttribute(.font, value: NSFont.boldSystemFont(ofSize: 16), range: NSRange(range, in: value)) }
        }
        return result
    }

    public func numberOfRows(in tableView: NSTableView) -> Int { if case .rows(let rows) = display.body { return rows.count }; return 0 }
    public func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard case .rows(let rows) = display.body, rows.indices.contains(row) else { return nil }
        let cell = NSTableCellView(); let text = NSTextField(labelWithString: "")
        let item = rows[row]; text.stringValue = item.subtitle.isEmpty ? item.title : "(item.title)  (item.subtitle)"
        if !item.accessories.isEmpty { text.stringValue += "  (item.accessories)" }
        text.font = item.selected ? .boldSystemFont(ofSize: NSFont.systemFontSize) : .systemFont(ofSize: NSFont.systemFontSize)
        cell.textField = text; cell.addSubview(text); text.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([text.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8), text.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -8), text.centerYAnchor.constraint(equalTo: cell.centerYAnchor)])
        return cell
    }
    public func tableViewSelectionDidChange(_ notification: Notification) { let row = tableView.selectedRow; guard case .rows(let rows) = display.body, rows.indices.contains(row) else { return }; onInput?(.select(rows[row].id)) }
    @objc private func searchEdited() { onInput?(presenter.searchChanged(searchField.stringValue)) }
    public func controlTextDidChange(_ obj: Notification) { onInput?(presenter.searchChanged(searchField.stringValue)) }
    private func handle(_ event: LauncherKey) { if let input = presenter.input(for: event) { onInput?(input) } }
}

@MainActor
final class LauncherContentView: NSView {
    var onKey: ((LauncherKey) -> Void)?
    override var acceptsFirstResponder: Bool { true }
    override func becomeFirstResponder() -> Bool { true }
    override func keyDown(with event: NSEvent) {
        let command = event.modifierFlags.contains(.command), shift = event.modifierFlags.contains(.shift), option = event.modifierFlags.contains(.option), control = event.modifierFlags.contains(.control)
        let code: LauncherKey.Code; let character: String?
        switch event.keyCode { case 126: code = .up; character = nil; case 125: code = .down; character = nil; case 123: code = .left; character = nil; case 124: code = .right; character = nil; case 36: code = .returnKey; character = nil; case 53: code = .escape; character = nil; default: code = .character; character = event.charactersIgnoringModifiers }
        onKey?(LauncherKey(code: code, character: character, command: command, shift: shift, option: option, control: control))
    }
}
