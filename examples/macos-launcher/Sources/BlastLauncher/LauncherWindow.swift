import AppKit
import BlastKit
import BlastPresenter

/// A search field that keeps plain typing for itself (the field editor's
/// delegate turns it into a search input) and forwards navigation keys,
/// Escape and Command shortcuts to the presenter.
final class LauncherSearchField: NSSearchField {
    var onKey: ((LauncherKey) -> Void)?

    override func keyDown(with event: NSEvent) {
        if let key = LauncherKey(event: event), key.shouldForwardFromSearchField {
            onKey?(key)
            return
        }
        super.keyDown(with: event)
    }
}

/// The window stays on the search field: clicking a row selects it but never
/// steals the keyboard, so users can keep typing after a click.
final class LauncherTableView: NSTableView {
    override var acceptsFirstResponder: Bool { false }
}

/// One result row. Tests inspect the labels to assert what was rendered.
final class LauncherRowCell: NSTableCellView {
    let iconLabel = NSTextField(labelWithString: "")
    let titleLabel = NSTextField(labelWithString: "")
    let subtitleLabel = NSTextField(labelWithString: "")
    let accessoryLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        textField = titleLabel
        iconLabel.alignment = .center
        iconLabel.font = .systemFont(ofSize: 13, weight: .medium)
        iconLabel.textColor = .secondaryLabelColor
        iconLabel.setContentHuggingPriority(.required, for: .horizontal)
        subtitleLabel.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        subtitleLabel.textColor = .secondaryLabelColor
        accessoryLabel.font = .systemFont(ofSize: NSFont.smallSystemFontSize)
        accessoryLabel.textColor = .secondaryLabelColor
        accessoryLabel.setContentHuggingPriority(.required, for: .horizontal)

        let labels = NSStackView(views: [titleLabel, subtitleLabel])
        labels.orientation = .vertical
        labels.alignment = .leading
        labels.spacing = 1
        let spacer = NSView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let stack = NSStackView(views: [iconLabel, labels, spacer, accessoryLabel])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 10
        addSubview(stack)
        stack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(_ row: LauncherRow) {
        iconLabel.stringValue = row.iconText
        iconLabel.isHidden = row.iconText.isEmpty
        titleLabel.stringValue = row.title
        titleLabel.font = row.selected
            ? .boldSystemFont(ofSize: NSFont.systemFontSize)
            : .systemFont(ofSize: NSFont.systemFontSize)
        titleLabel.textColor = row.enabled ? .labelColor : .disabledControlTextColor
        subtitleLabel.stringValue = row.subtitle
        subtitleLabel.isHidden = row.subtitle.isEmpty
        accessoryLabel.stringValue = row.accessories
        accessoryLabel.isHidden = row.accessories.isEmpty
    }
}

/// The AppKit shell. It owns no launcher semantics: `render` turns a
/// `LauncherDisplay` into subviews and user actions come back as
/// `ControllerInput` through `onInput`.
@MainActor
final class LauncherWindowController: NSWindowController, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    static let rowCellIdentifier = NSUserInterfaceItemIdentifier("LauncherRowCell")

    let presenter: LauncherPresenter
    let searchField = LauncherSearchField()
    let tableView = LauncherTableView()
    let tableScrollView = NSScrollView()
    let detailTextView = NSTextView()
    let detailScrollView = NSScrollView()
    let actionPanelView = NSBox()
    let actionStackView = NSStackView()
    let toastLabel = NSTextField(labelWithString: "")
    let emptyLabel = NSTextField(wrappingLabelWithString: "")
    let titleLabel = NSTextField(labelWithString: "")
    let backButton = NSButton(title: "‹ Back", target: nil, action: nil)
    let primaryLabel = NSTextField(labelWithString: "")

    private(set) var display: LauncherDisplay = .initial
    var onInput: ((ControllerInput) -> Void)?
    var onCancel: (() -> Void)?
    private var isRendering = false

    init(presenter: LauncherPresenter = LauncherPresenter()) {
        self.presenter = presenter
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: true
        )
        panel.isReleasedWhenClosed = false
        panel.title = "Blast Launcher"
        super.init(window: panel)
        configure()
        render(presenter.display)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // MARK: - Rendering

    func render(_ display: LauncherDisplay) {
        self.display = display
        isRendering = true
        defer { isRendering = false }

        titleLabel.stringValue = display.title
        titleLabel.isHidden = display.title.isEmpty
        searchField.placeholderString = display.searchPlaceholder
        if searchField.stringValue != display.searchText { searchField.stringValue = display.searchText }
        backButton.isHidden = !display.canGoBack
        primaryLabel.stringValue = display.primaryLabel
        primaryLabel.isHidden = display.primaryLabel.isEmpty
        toastLabel.stringValue = [display.toast?.title, display.toast?.message]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ": ")
        toastLabel.isHidden = toastLabel.stringValue.isEmpty

        tableScrollView.isHidden = true
        detailScrollView.isHidden = true
        emptyLabel.isHidden = true

        switch display.body {
        case .loading:
            emptyLabel.stringValue = "Loading…"
            emptyLabel.isHidden = false
        case .empty(let title, let description):
            emptyLabel.stringValue = description.isEmpty ? title : "\(title)\n\(description)"
            emptyLabel.isHidden = false
        case .rows:
            tableScrollView.isHidden = false
            tableView.reloadData()
            if let index = display.selectedRowIndex, display.rows.indices.contains(index) {
                tableView.selectRowIndexes(IndexSet(integer: index), byExtendingSelection: false)
                tableView.scrollRowToVisible(index)
            }
        case .detail(let markdown):
            detailScrollView.isHidden = false
            detailTextView.textStorage?.setAttributedString(Self.attributedMarkdown(markdown))
        }

        renderActions(display)
        window?.contentView?.layoutSubtreeIfNeeded()
    }

    private func renderActions(_ display: LauncherDisplay) {
        actionPanelView.isHidden = !display.actionsOpen
        for view in actionStackView.arrangedSubviews {
            actionStackView.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        guard display.actionsOpen else { return }
        let header = NSTextField(labelWithString: ([display.actionsTitle] + display.actionsBreadcrumb).joined(separator: " › "))
        header.font = .boldSystemFont(ofSize: 11)
        header.textColor = .secondaryLabelColor
        actionStackView.addArrangedSubview(header)
        for (index, line) in display.actionLines.enumerated() {
            let label = NSTextField(labelWithString: line)
            label.font = index == display.selectedActionIndex
                ? .boldSystemFont(ofSize: 12)
                : .systemFont(ofSize: 12)
            actionStackView.addArrangedSubview(label)
        }
    }

    var actionLines: [String] {
        actionStackView.arrangedSubviews.compactMap { ($0 as? NSTextField)?.stringValue }
    }

    /// Foundation's markdown importer supplies structure; the launcher supplies
    /// the body font where the importer leaves a gap.
    static func attributedMarkdown(_ markdown: String) -> NSAttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        let parsed = (try? NSAttributedString(markdown: markdown, options: options))
            ?? NSAttributedString(string: markdown)
        let result = NSMutableAttributedString(attributedString: parsed)
        let body = NSFont.systemFont(ofSize: NSFont.systemFontSize)
        result.enumerateAttribute(.font, in: NSRange(location: 0, length: result.length)) { value, range, _ in
            if value == nil { result.addAttribute(.font, value: body, range: range) }
        }
        return result
    }

    // MARK: - Layout

    private func configure() {
        guard let window, let root = window.contentView else { return }
        root.wantsLayer = true

        searchField.delegate = self
        searchField.sendsSearchStringImmediately = true
        searchField.onKey = { [weak self] key in self?.handle(key) }

        backButton.bezelStyle = .inline
        backButton.isBordered = false
        backButton.target = self
        backButton.action = #selector(backPressed)
        backButton.isHidden = true

        titleLabel.font = .boldSystemFont(ofSize: 16)
        primaryLabel.textColor = .secondaryLabelColor
        primaryLabel.alignment = .right

        emptyLabel.alignment = .center
        emptyLabel.textColor = .secondaryLabelColor
        emptyLabel.maximumNumberOfLines = 0
        emptyLabel.isHidden = true

        toastLabel.textColor = .systemBlue
        toastLabel.isHidden = true

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("main"))
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        tableView.headerView = nil
        tableView.dataSource = self
        tableView.delegate = self
        tableView.rowHeight = 28
        tableView.usesAlternatingRowBackgroundColors = true
        tableView.selectionHighlightStyle = .regular
        tableView.allowsEmptySelection = true
        tableView.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        tableScrollView.documentView = tableView
        tableScrollView.hasVerticalScroller = true
        tableScrollView.drawsBackground = false
        tableScrollView.isHidden = true

        detailTextView.isEditable = false
        detailTextView.isSelectable = false
        detailTextView.drawsBackground = false
        detailTextView.textContainerInset = NSSize(width: 10, height: 10)
        detailTextView.isVerticallyResizable = true
        detailTextView.isHorizontallyResizable = false
        detailTextView.autoresizingMask = [.width]
        detailTextView.textContainer?.widthTracksTextView = true
        detailScrollView.documentView = detailTextView
        detailScrollView.hasVerticalScroller = true
        detailScrollView.drawsBackground = false
        detailScrollView.isHidden = true

        actionPanelView.boxType = .custom
        actionPanelView.titlePosition = .noTitle
        actionPanelView.borderWidth = 1
        actionPanelView.borderColor = .separatorColor
        actionPanelView.cornerRadius = 6
        actionPanelView.fillColor = .clear
        actionPanelView.contentViewMargins = NSSize(width: 10, height: 8)
        actionStackView.orientation = .vertical
        actionStackView.alignment = .leading
        actionStackView.spacing = 3
        actionPanelView.contentView = actionStackView
        actionPanelView.isHidden = true

        let spacer = NSView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        titleLabel.setContentHuggingPriority(.defaultLow, for: .horizontal)
        primaryLabel.setContentHuggingPriority(.required, for: .horizontal)
        let header = NSStackView(views: [backButton, titleLabel, spacer, primaryLabel])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 8

        let columnStack = NSStackView(views: [
            header,
            searchField,
            tableScrollView,
            detailScrollView,
            emptyLabel,
            actionPanelView,
            toastLabel,
        ])
        columnStack.orientation = .vertical
        columnStack.alignment = .leading
        columnStack.spacing = 10
        columnStack.edgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 18, right: 20)
        root.addSubview(columnStack)
        columnStack.translatesAutoresizingMaskIntoConstraints = false

        for view in columnStack.arrangedSubviews {
            view.translatesAutoresizingMaskIntoConstraints = false
            view.widthAnchor.constraint(equalTo: columnStack.widthAnchor, constant: -40).isActive = true
        }
        NSLayoutConstraint.activate([
            columnStack.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            columnStack.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            columnStack.topAnchor.constraint(equalTo: root.topAnchor),
            columnStack.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            searchField.heightAnchor.constraint(equalToConstant: 30),
            tableScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 200),
            detailScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 200),
        ])

        window.initialFirstResponder = searchField
        window.makeFirstResponder(searchField)
    }

    // MARK: - Table data

    func numberOfRows(in tableView: NSTableView) -> Int {
        display.rows.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard display.rows.indices.contains(row) else { return nil }
        let cell = tableView.makeView(withIdentifier: Self.rowCellIdentifier, owner: nil) as? LauncherRowCell
            ?? LauncherRowCell(frame: .zero)
        cell.identifier = Self.rowCellIdentifier
        cell.configure(display.rows[row])
        return cell
    }

    func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
        guard display.rows.indices.contains(row) else { return 28 }
        return display.rows[row].subtitle.isEmpty ? 28 : 44
    }

    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        guard display.rows.indices.contains(row) else { return false }
        return display.rows[row].kind != .gridHeader && display.rows[row].kind != .menuBarSection
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard !isRendering else { return }
        let row = tableView.selectedRow
        guard display.rows.indices.contains(row) else { return }
        onInput?(.select(display.rows[row].id))
    }

    // MARK: - Input

    func controlTextDidChange(_ obj: Notification) {
        guard !isRendering else { return }
        onInput?(presenter.searchChanged(searchField.stringValue))
    }

    @objc private func backPressed() {
        onInput?(.back)
    }

    private func handle(_ key: LauncherKey) {
        if let input = presenter.input(for: key) {
            onInput?(input)
            return
        }
        if key.code == .escape { onCancel?() }
    }
}

extension LauncherKey {
    /// Maps an AppKit key event to the AppKit-free presenter key.
    init?(event: NSEvent) {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let code: Code
        switch event.keyCode {
        case 126: code = .up
        case 125: code = .down
        case 123: code = .left
        case 124: code = .right
        case 36, 76: code = .returnKey
        case 53: code = .escape
        default:
            guard let characters = event.charactersIgnoringModifiers, !characters.isEmpty else { return nil }
            code = .character
        }
        self.init(
            code: code,
            character: code == .character ? event.charactersIgnoringModifiers : nil,
            command: flags.contains(.command),
            shift: flags.contains(.shift),
            option: flags.contains(.option),
            control: flags.contains(.control)
        )
    }

    /// Plain typing belongs to the search field's own editor; every other key
    /// is a semantic launcher input.
    var shouldForwardFromSearchField: Bool {
        switch code {
        case .character: return command || control || option
        default: return true
        }
    }
}
