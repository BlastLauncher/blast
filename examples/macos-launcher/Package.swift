// swift-tools-version: 6.0
import PackageDescription

// BlastKit is the Foundation-only Swift client for `blast serve` (embedder
// protocol v1). It has no dependencies and no Xcode project; tests are the
// contract (Swift Testing, fake transports plus a real-engine integration test).
let package = Package(
    name: "BlastKit",
    platforms: [.macOS(.v14)],
    products: [.library(name: "BlastKit", targets: ["BlastKit"])],
    targets: [
        .target(name: "BlastKit"),
        .testTarget(name: "BlastKitTests", dependencies: ["BlastKit"]),
    ]
)
