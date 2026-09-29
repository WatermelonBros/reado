// Park the real mouse pointer in the menu bar of the main display — outside the
// Reado window, so it doesn't show up in the capture (avfoundation draws it even
// with -capture_cursor 0). Needs no Accessibility permission.
import CoreGraphics
CGWarpMouseCursorPosition(CGPoint(x: 700, y: 6))
