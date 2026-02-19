import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:window_manager/window_manager.dart';

import 'app.dart';
import 'services/bare_bridge.dart';
import 'services/p2p_service.dart';
import 'services/tray_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  final bridge = BareBridge();
  final p2pService = P2pService(bridge);

  // Initialize the native bridge and start the P2P node
  try {
    final appDir = await getApplicationSupportDirectory();
    final dataDir = appDir.path;

    // Copy the JS bundle from Flutter assets to a filesystem path
    // that the C bridge can read with fopen().
    // Always overwrite to pick up changes during development.
    final bundlePath = '${appDir.path}/bare_bundle.js';
    final bundleData = await rootBundle.load('assets/bare/bundle.js');
    await File(bundlePath).writeAsBytes(bundleData.buffer.asUint8List());

    await bridge.init(dataDir, bundlePath);

    // Start the P2P node
    p2pService.startNode(dataDir);
  } catch (e) {
    // If native bridge fails (e.g. library not found), the app still runs
    // with the UI but shows disconnected state.
    debugPrint('Failed to initialize native bridge: $e');
  }

  runApp(SpillApp(p2pService: p2pService));

  if (Platform.isMacOS || Platform.isWindows || Platform.isLinux) {
    final trayService = TrayService(router);
    await trayService.init();
  }
}
