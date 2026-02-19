import 'dart:io';

import 'package:go_router/go_router.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

class TrayService with TrayListener {
  final GoRouter _router;
  TrayService(this._router);

  Future<void> init() async {
    // tray_manager.setIcon expects a Flutter asset path.
    // macOS: grayscale template icon; Windows: .ico; Linux: color .png.
    if (Platform.isMacOS) {
      await trayManager.setIcon('assets/tray_icon_macos.png', isTemplate: true);
    } else if (Platform.isWindows) {
      await trayManager.setIcon('assets/tray_icon.ico');
    } else {
      await trayManager.setIcon('assets/tray_icon.png');
    }
    await trayManager.setContextMenu(Menu(items: [
      MenuItem(key: 'open', label: 'Open Spill'),
      MenuItem(key: 'publish', label: 'Publish Video'),
      MenuItem.separator(),
      MenuItem(key: 'quit', label: 'Quit'),
    ]));
    trayManager.addListener(this);
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'open':
        _showWindow();
      case 'publish':
        _showWindow();
        _router.go('/publish');
      case 'quit':
        exit(0);
    }
  }

  @override
  void onTrayIconMouseDown() {
    // On Windows/Linux, left-click may not auto-show the context menu.
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayIconRightMouseDown() {
    trayManager.popUpContextMenu();
  }

  Future<void> _showWindow() async {
    await windowManager.show();
    await windowManager.focus();
  }
}
