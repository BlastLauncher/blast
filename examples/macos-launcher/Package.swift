// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BlastKit",
    platforms: [.macOS(.v14)],
    products: [.library(name: "BlastKit", targets: ["BlastKit"])],
    targets: [
        .target(name: "BlastKit"),
        .testTarget(name: "BlastKitTests", dependencies: ["BlastKit"], resources: [.process("../Fixtures")]),
    ]
)
