import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/categories.dart';
import '../../models/content_type.dart';
import '../../theme/colors.dart';
import '../../widgets/angular_container.dart';
import '../services/archive_api.dart';

/// Web-safe publish screen. Uses file_picker with withData:true for bytes.
/// No dart:io imports. Thumbnails are auto-generated server-side via ffmpeg.
class WebPublishScreen extends StatefulWidget {
  const WebPublishScreen({super.key});

  @override
  State<WebPublishScreen> createState() => _WebPublishScreenState();
}

class _WebPublishScreenState extends State<WebPublishScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  Uint8List? _fileBytes;
  String? _fileName;
  String? _selectedCategory;
  String _contentType = 'video';
  bool _publishing = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: supportedExtensions,
      allowMultiple: false,
      withData: true,
    );
    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      setState(() {
        _fileBytes = file.bytes;
        _fileName = file.name;
        _contentType = detectContentType(file.name);
        // Auto-fill title from filename if empty
        if (_titleController.text.isEmpty) {
          final name = file.name;
          final dotIndex = name.lastIndexOf('.');
          _titleController.text = dotIndex > 0 ? name.substring(0, dotIndex) : name;
        }
      });
    }
  }

  Future<void> _publish() async {
    if (_fileBytes == null) {
      setState(() => _error = 'Please select a file');
      return;
    }
    if (_titleController.text.trim().isEmpty) {
      setState(() => _error = 'Please enter a title');
      return;
    }
    if (_selectedCategory == null) {
      setState(() => _error = 'Please select a category');
      return;
    }

    setState(() {
      _publishing = true;
      _error = null;
    });

    try {
      await context.read<ArchiveApi>().publishVideo(
            videoBytes: _fileBytes!,
            filename: _fileName ?? 'file',
            title: _titleController.text.trim(),
            description: _descriptionController.text.trim(),
            category: _selectedCategory!,
            contentType: _contentType,
          );
      if (mounted) {
        context.go('/');
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _publishing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          'Publish',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(
            height: 1,
            color: SpillColors.divider,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Video file picker
            GestureDetector(
              onTap: _publishing ? null : _pickFile,
              child: AngularContainer(
                cutSize: 20,
                color: SpillColors.surface,
                padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
                child: Column(
                  children: [
                    Icon(
                      _fileBytes != null ? contentTypeIcon(_contentType) : Icons.upload_file,
                      size: 48,
                      color: _fileBytes != null
                          ? SpillColors.accent
                          : SpillColors.textSecondary,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _fileName ?? 'Select file',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: _fileBytes != null
                                ? SpillColors.textPrimary
                                : SpillColors.textSecondary,
                          ),
                      textAlign: TextAlign.center,
                    ),
                    if (_fileBytes != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Tap to change',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Title field
            Text(
              'Title',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _titleController,
              style: Theme.of(context).textTheme.bodyLarge,
              decoration: const InputDecoration(
                hintText: 'Enter title',
              ),
              enabled: !_publishing,
            ),
            const SizedBox(height: 20),

            // Description field
            Text(
              'Description',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _descriptionController,
              style: Theme.of(context).textTheme.bodyLarge,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Describe your content...',
              ),
              enabled: !_publishing,
            ),
            const SizedBox(height: 20),

            // Category dropdown
            Text(
              'Category',
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _selectedCategory,
              decoration: const InputDecoration(
                hintText: 'Select a category',
              ),
              items: categories
                  .map((cat) => DropdownMenuItem(
                        value: cat,
                        child: Text(cat),
                      ))
                  .toList(),
              onChanged: _publishing
                  ? null
                  : (value) => setState(() => _selectedCategory = value),
            ),
            const SizedBox(height: 24),

            // Error message
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  _error!,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: SpillColors.error,
                      ),
                ),
              ),

            // Publish button / progress
            if (_publishing)
              Consumer<ArchiveApi>(
                builder: (context, api, _) => Column(
                  children: [
                    LinearProgressIndicator(value: api.publishProgress),
                    const SizedBox(height: 12),
                    Text(
                      api.publishStage.isNotEmpty
                          ? api.publishStage
                          : 'Publishing...',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: SpillColors.textSecondary,
                          ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${(api.publishProgress * 100).round()}%',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: SpillColors.textSecondary,
                          ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else
              AngularButton(
                label: 'Publish',
                icon: Icons.publish,
                onPressed: _publish,
              ),
          ],
        ),
      ),
    );
  }
}
