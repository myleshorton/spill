import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:video_thumbnail/video_thumbnail.dart';
import 'package:path_provider/path_provider.dart';

import '../models/categories.dart';
import '../models/content_type.dart';
import '../services/p2p_service.dart';
import '../theme/colors.dart';
import '../widgets/angular_container.dart';

/// Screen for publishing a new video to the P2P network.
class PublishScreen extends StatefulWidget {
  const PublishScreen({super.key});

  @override
  State<PublishScreen> createState() => _PublishScreenState();
}

class _PublishScreenState extends State<PublishScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  String? _selectedFilePath;
  String? _selectedFileName;
  String? _thumbnailPath;
  String? _selectedCategory;
  String _contentType = 'video';
  bool _publishing = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    if (_thumbnailPath != null) {
      try {
        File(_thumbnailPath!).deleteSync();
      } catch (_) {}
    }
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: supportedExtensions,
      allowMultiple: false,
    );
    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      final detectedType = detectContentType(file.name);
      setState(() {
        _selectedFilePath = file.path;
        _selectedFileName = file.name;
        _thumbnailPath = null;
        _contentType = detectedType;
        // Auto-fill title from filename if empty
        if (_titleController.text.isEmpty && _selectedFileName != null) {
          final name = _selectedFileName!;
          final dotIndex = name.lastIndexOf('.');
          _titleController.text =
              dotIndex > 0 ? name.substring(0, dotIndex) : name;
        }
      });
      if (detectedType == 'video') {
        _generateThumbnail();
      } else if (detectedType == 'image' && file.path != null) {
        // Use the image itself as thumbnail
        setState(() => _thumbnailPath = file.path);
      }
    }
  }

  Future<void> _generateThumbnail() async {
    if (_selectedFilePath == null) return;
    try {
      final tmpDir = await getTemporaryDirectory();

      // Try video_thumbnail package first (works on iOS/Android)
      try {
        final thumbPath = await VideoThumbnail.thumbnailFile(
          video: _selectedFilePath!,
          thumbnailPath: tmpDir.path,
          maxWidth: 640,
          quality: 75,
          imageFormat: ImageFormat.JPEG,
        );
        if (mounted && thumbPath != null) {
          setState(() => _thumbnailPath = thumbPath);
          return;
        }
      } catch (_) {}

      // Fallback for macOS: use ffmpeg if available, else qlmanage
      if (!Platform.isMacOS) return;
      final thumbFile =
          File('${tmpDir.path}/thumb_${DateTime.now().millisecondsSinceEpoch}.jpg');

      // Try ffmpeg first
      var result = await Process.run('ffmpeg', [
        '-i', _selectedFilePath!,
        '-vframes', '1',
        '-vf', 'scale=640:-1',
        '-y',
        thumbFile.path,
      ]);

      if (result.exitCode != 0 || !thumbFile.existsSync()) {
        // Try qlmanage as last resort
        result = await Process.run(
            'qlmanage', ['-t', '-s', '640', '-o', tmpDir.path, _selectedFilePath!]);
        if (result.exitCode == 0) {
          // qlmanage outputs as {filename}.png in output dir
          final qlOutput =
              File('${tmpDir.path}/${_selectedFilePath!.split('/').last}.png');
          if (qlOutput.existsSync()) {
            qlOutput.renameSync(thumbFile.path);
          }
        }
      }

      if (mounted && thumbFile.existsSync() && thumbFile.lengthSync() > 0) {
        setState(() => _thumbnailPath = thumbFile.path);
      }
    } catch (_) {
      // Best-effort: don't block publishing if thumbnail generation fails
    }
  }

  Future<void> _publish() async {
    if (_selectedFilePath == null) {
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
      await context.read<P2pService>().publishVideo(
            videoPath: _selectedFilePath!,
            title: _titleController.text.trim(),
            description: _descriptionController.text.trim(),
            thumbnailPath: _contentType == 'image' ? null : _thumbnailPath,
            category: _selectedCategory!,
            contentType: _contentType,
            fileName: _selectedFileName,
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
            // File picker area
            GestureDetector(
              onTap: _publishing ? null : _pickFile,
              child: _thumbnailPath != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          AspectRatio(
                            aspectRatio: 16 / 9,
                            child: Image.file(
                              File(_thumbnailPath!),
                              fit: BoxFit.cover,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: SpillColors.background.withValues(alpha: 0.8),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _selectedFileName ?? 'Tap to change',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ),
                        ],
                      ),
                    )
                  : AngularContainer(
                      cutSize: 20,
                      color: SpillColors.surface,
                      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
                      child: Column(
                        children: [
                          Icon(
                            _selectedFilePath != null
                                ? contentTypeIcon(_contentType)
                                : Icons.upload_file,
                            size: 48,
                            color: _selectedFilePath != null
                                ? SpillColors.accent
                                : SpillColors.textSecondary,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _selectedFileName ?? 'Select file',
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  color: _selectedFilePath != null
                                      ? SpillColors.textPrimary
                                      : SpillColors.textSecondary,
                                ),
                            textAlign: TextAlign.center,
                          ),
                          if (_selectedFilePath != null) ...[
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

            // Publish button
            if (_publishing)
              Consumer<P2pService>(
                builder: (context, p2p, _) => Column(
                  children: [
                    LinearProgressIndicator(value: p2p.publishProgress),
                    const SizedBox(height: 12),
                    Text(
                      p2p.publishStage.isNotEmpty
                          ? p2p.publishStage
                          : 'Publishing...',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: SpillColors.textSecondary,
                          ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${(p2p.publishProgress * 100).round()}%',
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
