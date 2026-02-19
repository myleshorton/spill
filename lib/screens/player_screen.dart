import 'dart:io';

import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart' as ja;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';

import '../models/video_meta.dart';
import '../services/p2p_service.dart';
import '../theme/colors.dart';
import '../widgets/angular_container.dart';
import '../widgets/thumbnail_image.dart';

/// Content playback/viewer screen.
///
/// Routes to the appropriate viewer based on content type:
/// - video → Chewie player
/// - audio → just_audio with play/pause/seek
/// - image → InteractiveViewer with pinch-to-zoom
/// - document → download + open in system app
class PlayerScreen extends StatefulWidget {
  final VideoMeta video;

  const PlayerScreen({super.key, required this.video});

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  ja.AudioPlayer? _audioPlayer;
  File? _localFile;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  /// Derive cache file extension from the fileKey path.
  String _fileExtension() {
    final key = widget.video.fileKey;
    final dotIdx = key.lastIndexOf('.');
    if (dotIdx >= 0) return key.substring(dotIdx);
    return '.mp4'; // fallback
  }

  Future<void> _loadContent() async {
    switch (widget.video.contentType) {
      case 'video':
        await _loadVideo();
        break;
      case 'audio':
        await _loadAudio();
        break;
      case 'image':
        await _loadImage();
        break;
      case 'document':
        await _loadDocument();
        break;
      default:
        await _loadVideo();
    }
  }

  Future<void> _loadVideo() async {
    final p2p = context.read<P2pService>();
    try {
      final tmpDir = await getTemporaryDirectory();
      final destPath = '${tmpDir.path}/${widget.video.id}${_fileExtension()}';
      final file = File(destPath);

      VideoPlayerController videoController;

      if (file.existsSync()) {
        videoController = VideoPlayerController.file(file);
      } else {
        final streamUrl = p2p.getStreamUrl(
          widget.video.driveKey,
          widget.video.videoKey,
        );

        if (streamUrl != null) {
          videoController = VideoPlayerController.networkUrl(
            Uri.parse(streamUrl),
          );
          p2p.fetchVideo(
            widget.video.driveKey,
            widget.video.videoKey,
            destPath,
          );
        } else {
          await p2p.fetchVideo(
            widget.video.driveKey,
            widget.video.videoKey,
            destPath,
          );
          videoController = VideoPlayerController.file(File(destPath));
        }
      }

      await videoController.initialize();

      if (!mounted) {
        videoController.dispose();
        return;
      }

      final chewieController = ChewieController(
        videoPlayerController: videoController,
        autoPlay: true,
      );

      setState(() {
        _videoController = videoController;
        _chewieController = chewieController;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadAudio() async {
    final p2p = context.read<P2pService>();
    try {
      final tmpDir = await getTemporaryDirectory();
      final destPath = '${tmpDir.path}/${widget.video.id}${_fileExtension()}';
      final file = File(destPath);

      if (!file.existsSync()) {
        await p2p.fetchVideo(
          widget.video.driveKey,
          widget.video.fileKey,
          destPath,
        );
      }

      final player = ja.AudioPlayer();
      await player.setFilePath(destPath);

      if (!mounted) {
        player.dispose();
        return;
      }

      setState(() {
        _audioPlayer = player;
        _localFile = File(destPath);
        _loading = false;
      });

      player.play();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadImage() async {
    final p2p = context.read<P2pService>();
    try {
      final tmpDir = await getTemporaryDirectory();
      final destPath = '${tmpDir.path}/${widget.video.id}${_fileExtension()}';
      final file = File(destPath);

      if (!file.existsSync()) {
        await p2p.fetchVideo(
          widget.video.driveKey,
          widget.video.fileKey,
          destPath,
        );
      }

      if (!mounted) return;
      setState(() {
        _localFile = File(destPath);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadDocument() async {
    final p2p = context.read<P2pService>();
    try {
      final tmpDir = await getTemporaryDirectory();
      final destPath = '${tmpDir.path}/${widget.video.id}${_fileExtension()}';
      final file = File(destPath);

      if (!file.existsSync()) {
        await p2p.fetchVideo(
          widget.video.driveKey,
          widget.video.fileKey,
          destPath,
        );
      }

      if (!mounted) return;
      setState(() {
        _localFile = File(destPath);
        _loading = false;
      });

      // Open in system app
      await OpenFilex.open(destPath);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController?.dispose();
    _audioPlayer?.dispose();
    super.dispose();
  }

  Widget _buildContentViewer() {
    if (_loading) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: Stack(
          children: [
            Positioned.fill(
              child: ThumbnailImage(video: widget.video),
            ),
            Positioned.fill(
              child: Container(
                color: SpillColors.surface.withValues(alpha: 0.5),
                child: const Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: Container(
          color: SpillColors.surface,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _error!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: SpillColors.textSecondary,
                    ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
    }

    switch (widget.video.contentType) {
      case 'video':
        return _buildVideoPlayer();
      case 'audio':
        return _buildAudioPlayer();
      case 'image':
        return _buildImageViewer();
      case 'document':
        return _buildDocumentViewer();
      default:
        return _buildVideoPlayer();
    }
  }

  Widget _buildVideoPlayer() {
    return AspectRatio(
      aspectRatio: _videoController!.value.aspectRatio,
      child: Chewie(controller: _chewieController!),
    );
  }

  Widget _buildAudioPlayer() {
    final player = _audioPlayer!;
    return Container(
      color: SpillColors.surface,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.audiotrack,
            size: 64,
            color: SpillColors.accent,
          ),
          const SizedBox(height: 24),
          // Play/pause button
          StreamBuilder<ja.PlayerState>(
            stream: player.playerStateStream,
            builder: (context, snapshot) {
              final state = snapshot.data;
              final playing = state?.playing ?? false;
              final processingState = state?.processingState;
              return Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    iconSize: 48,
                    icon: Icon(
                      processingState == ja.ProcessingState.completed
                          ? Icons.replay
                          : playing
                              ? Icons.pause_circle_filled
                              : Icons.play_circle_filled,
                      color: SpillColors.accent,
                    ),
                    onPressed: () {
                      if (processingState == ja.ProcessingState.completed) {
                        player.seek(Duration.zero);
                        player.play();
                      } else if (playing) {
                        player.pause();
                      } else {
                        player.play();
                      }
                    },
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          // Seek bar
          StreamBuilder<Duration>(
            stream: player.positionStream,
            builder: (context, snapshot) {
              final position = snapshot.data ?? Duration.zero;
              final duration = player.duration ?? Duration.zero;
              return Column(
                children: [
                  Slider(
                    min: 0,
                    max: duration.inMilliseconds.toDouble().clamp(1, double.infinity),
                    value: position.inMilliseconds.toDouble().clamp(0, duration.inMilliseconds.toDouble().clamp(1, double.infinity)),
                    onChanged: (value) {
                      player.seek(Duration(milliseconds: value.round()));
                    },
                    activeColor: SpillColors.accent,
                    inactiveColor: SpillColors.surfaceLight,
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          _formatDuration(position),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        Text(
                          _formatDuration(duration),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      return '${d.inHours}:$minutes:$seconds';
    }
    return '$minutes:$seconds';
  }

  Widget _buildImageViewer() {
    return InteractiveViewer(
      minScale: 0.5,
      maxScale: 4.0,
      child: Image.file(
        _localFile!,
        fit: BoxFit.contain,
        errorBuilder: (_, error, __) => Center(
          child: Text(
            'Failed to load image: $error',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: SpillColors.textSecondary,
                ),
          ),
        ),
      ),
    );
  }

  Widget _buildDocumentViewer() {
    return Container(
      color: SpillColors.surface,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.description,
            size: 64,
            color: SpillColors.accent,
          ),
          const SizedBox(height: 16),
          Text(
            'Document downloaded',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'Opening in system viewer...',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: SpillColors.textSecondary,
                ),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () {
              if (_localFile != null) {
                OpenFilex.open(_localFile!.path);
              }
            },
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open Again'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final video = widget.video;
    final appBarTitle = video.isVideo
        ? 'Now Playing'
        : video.isAudio
            ? 'Now Playing'
            : video.isImage
                ? 'Viewing'
                : 'Document';
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
        title: Text(
          appBarTitle,
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildContentViewer(),
            // Metadata
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title
                  Text(
                    video.title,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 12),
                  // Stats row
                  Row(
                    children: [
                      _StatChip(
                        icon: Icons.people_outline,
                        label: '${video.peerCount} peers',
                      ),
                      const SizedBox(width: 16),
                      _StatChip(
                        icon: Icons.calendar_today_outlined,
                        label: video.formattedDate,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Description
                  if (video.description.isNotEmpty)
                    AngularContainer(
                      color: SpillColors.surface,
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        video.description,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  const SizedBox(height: 16),
                  // Publisher
                  AngularContainer(
                    color: SpillColors.surface,
                    cutSize: 10,
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Icon(
                          video.publisherName != null
                              ? Icons.person_outline
                              : Icons.vpn_key_outlined,
                          size: 16,
                          color: SpillColors.textSecondary,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            video.publisherName ?? video.truncatedDriveKey,
                            style: Theme.of(context).textTheme.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Drive key
                  AngularContainer(
                    color: SpillColors.surface,
                    cutSize: 10,
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.vpn_key_outlined,
                          size: 16,
                          color: SpillColors.textSecondary,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            video.driveKey,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  fontFamily: 'JetBrains Mono',
                                ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy, size: 16),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: video.driveKey));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Discovery key copied'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          },
                          tooltip: 'Copy discovery key',
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _StatChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: SpillColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: SpillColors.textSecondary),
          const SizedBox(width: 6),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}
