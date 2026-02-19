import 'package:flutter/material.dart';

import 'app.dart';
import 'services/archive_api.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // When served by the archiver, the API is at the same origin (no base URL needed).
  final api = ArchiveApi();

  runApp(ArchiveApp(api: api));
}
