import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/video_meta.dart';
import '../../models/categories.dart';
import '../../theme/colors.dart';
import '../../widgets/connection_indicator.dart';
import '../services/archive_api.dart';
import '../widgets/video_card.dart';

/// Main screen: matches desktop HomeScreen with Popular/Recent tabs,
/// search, category filter, and publish FAB.
class WebHomeScreen extends StatefulWidget {
  const WebHomeScreen({super.key});

  @override
  State<WebHomeScreen> createState() => _WebHomeScreenState();
}

class _WebHomeScreenState extends State<WebHomeScreen>
    with SingleTickerProviderStateMixin {
  final _searchController = TextEditingController();
  late final TabController _tabController;
  String? _selectedCategory;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final api = context.read<ArchiveApi>();
      api.fetchVideos();
      api.fetchStats();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _onSearch() {
    final q = _searchController.text;
    context.read<ArchiveApi>().search(q);
  }

  void _setCategory(String? category) {
    setState(() => _selectedCategory = category);
    // Navigate to the Popular tab (index 0) when a category is selected
    if (category != null) {
      _tabController.animateTo(0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Text(
              'Spill',
              style: Theme.of(context).textTheme.displaySmall,
            ),
            const SizedBox(width: 12),
            Consumer<ArchiveApi>(
              builder: (context, api, _) => ConnectionIndicator(
                connected: api.connected,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.video_library_outlined),
            onPressed: () => context.go('/my-videos'),
            tooltip: 'My files',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              context.read<ArchiveApi>().refreshVideos();
              context.read<ArchiveApi>().fetchStats();
            },
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.go('/settings'),
            tooltip: 'Settings',
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(137),
          child: Column(
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        context.read<ArchiveApi>().fetchVideos();
                      },
                    ),
                    isDense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onSubmitted: (_) => _onSearch(),
                ),
              ),
              // Category filter pills (YouTube-style compact)
              SizedBox(
                height: 32,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    _CategoryPill(
                      label: 'All',
                      selected: _selectedCategory == null,
                      onTap: () => _setCategory(null),
                    ),
                    for (final cat in categories)
                      _CategoryPill(
                        label: cat,
                        selected: _selectedCategory == cat,
                        onTap: () => _setCategory(cat),
                      ),
                  ],
                ),
              ),
              TabBar(
                controller: _tabController,
                labelColor: SpillColors.accent,
                unselectedLabelColor: SpillColors.textSecondary,
                indicatorColor: SpillColors.accent,
                tabs: const [
                  Tab(text: 'Popular'),
                  Tab(text: 'Recent'),
                ],
              ),
              Container(height: 1, color: SpillColors.divider),
            ],
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _WebPopularTab(
            key: ValueKey('popular-$_selectedCategory'),
            category: _selectedCategory,
            onVideoTap: (video) => _openVideo(context, video),
          ),
          _WebRecentTab(
            key: ValueKey('recent-$_selectedCategory'),
            category: _selectedCategory,
            onVideoTap: (video) => _openVideo(context, video),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: SpillColors.accent,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        onPressed: () => context.go('/publish'),
        child: const Icon(Icons.publish),
      ),
    );
  }

  void _openVideo(BuildContext context, VideoMeta video) {
    context.go('/player/${video.id}', extra: video);
  }
}

// ---------------------------------------------------------------------------
// Recent tab — paginated via HTTP limit/offset, filtered by category
// ---------------------------------------------------------------------------

class _WebRecentTab extends StatefulWidget {
  final String? category;
  final void Function(VideoMeta video) onVideoTap;

  const _WebRecentTab({super.key, this.category, required this.onVideoTap});

  @override
  State<_WebRecentTab> createState() => _WebRecentTabState();
}

class _WebRecentTabState extends State<_WebRecentTab>
    with AutomaticKeepAliveClientMixin {
  final ScrollController _scrollController = ScrollController();
  final List<VideoMeta> _videos = [];
  int _offset = 0;
  bool _loading = false;
  bool _hasMore = true;
  bool _initialLoad = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);

    try {
      final api = context.read<ArchiveApi>();
      final result = await api.fetchRecentVideos(
        limit: 20,
        offset: _offset,
        category: widget.category,
      );
      final newVideos = result['videos'] as List<VideoMeta>;
      final hasMore = result['hasMore'] as bool;
      final nextOffset = result['nextOffset'] as int;

      if (mounted) {
        setState(() {
          _videos.addAll(newVideos);
          _offset = nextOffset;
          _hasMore = hasMore;
          _loading = false;
          _initialLoad = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _initialLoad = false;
        });
      }
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _videos.clear();
      _offset = 0;
      _hasMore = true;
      _initialLoad = true;
    });
    await _loadMore();
  }

  int _crossAxisCount(double width) {
    if (width < 600) return 1;
    if (width < 900) return 2;
    if (width < 1200) return 3;
    return 4;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    if (_initialLoad && _loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_videos.isEmpty && !_loading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.folder_off_outlined,
                size: 64,
                color:
                    SpillColors.textSecondary.withValues(alpha: 0.4),
              ),
              const SizedBox(height: 24),
              Text(
                'No recent files',
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(color: SpillColors.textSecondary),
              ),
              const SizedBox(height: 8),
              Text(
                widget.category != null
                    ? 'No recent files in this category.'
                    : 'Files will appear here as they\nare published to the network.',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: SpillColors.textSecondary),
              ),
            ],
          ),
        ),
      );
    }

    final api = context.read<ArchiveApi>();

    return RefreshIndicator(
      color: SpillColors.accent,
      backgroundColor: SpillColors.surface,
      onRefresh: _refresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = _crossAxisCount(constraints.maxWidth);
          final itemCount = _videos.length + (_hasMore ? 1 : 0);

          return GridView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              crossAxisSpacing: 16,
              mainAxisSpacing: 12,
              childAspectRatio: 1.05,
            ),
            itemCount: itemCount,
            itemBuilder: (context, index) {
              if (index >= _videos.length) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              final video = _videos[index];
              return WebVideoCard(
                video: video,
                api: api,
                onTap: () => widget.onVideoTap(video),
              );
            },
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Popular tab — fetches videos and sorts by peer count, filtered by category
// ---------------------------------------------------------------------------

class _WebPopularTab extends StatefulWidget {
  final String? category;
  final void Function(VideoMeta video) onVideoTap;

  const _WebPopularTab({super.key, this.category, required this.onVideoTap});

  @override
  State<_WebPopularTab> createState() => _WebPopularTabState();
}

// ---------------------------------------------------------------------------
// YouTube-style compact category pill
// ---------------------------------------------------------------------------

class _CategoryPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? SpillColors.accent : SpillColors.surfaceLight,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? Colors.white : SpillColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}

class _WebPopularTabState extends State<_WebPopularTab>
    with AutomaticKeepAliveClientMixin {
  final ScrollController _scrollController = ScrollController();
  final List<VideoMeta> _videos = [];
  int _offset = 0;
  bool _loading = false;
  bool _hasMore = true;
  bool _initialLoad = true;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);

    try {
      final api = context.read<ArchiveApi>();
      final result =
          await api.fetchRecentVideos(limit: 20, offset: _offset, category: widget.category);
      final newVideos = result['videos'] as List<VideoMeta>;
      final hasMore = result['hasMore'] as bool;
      final nextOffset = result['nextOffset'] as int;

      if (mounted) {
        setState(() {
          _videos.addAll(newVideos);
          // Re-sort the full list by peer count after each page load
          _videos.sort((a, b) => b.peerCount.compareTo(a.peerCount));
          _offset = nextOffset;
          _hasMore = hasMore;
          _loading = false;
          _initialLoad = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _initialLoad = false;
        });
      }
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _videos.clear();
      _offset = 0;
      _hasMore = true;
      _initialLoad = true;
    });
    await _loadMore();
  }

  int _crossAxisCount(double width) {
    if (width < 600) return 1;
    if (width < 900) return 2;
    if (width < 1200) return 3;
    return 4;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    if (_initialLoad && _loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_videos.isEmpty && !_loading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.folder_off_outlined,
                size: 64,
                color:
                    SpillColors.textSecondary.withValues(alpha: 0.4),
              ),
              const SizedBox(height: 24),
              Text(
                'No popular files',
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(color: SpillColors.textSecondary),
              ),
              const SizedBox(height: 8),
              Text(
                widget.category != null
                    ? 'No popular files in this category.'
                    : 'Files with active peers will\nappear here ranked by popularity.',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: SpillColors.textSecondary),
              ),
            ],
          ),
        ),
      );
    }

    final api = context.read<ArchiveApi>();

    return RefreshIndicator(
      color: SpillColors.accent,
      backgroundColor: SpillColors.surface,
      onRefresh: _refresh,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = _crossAxisCount(constraints.maxWidth);
          final itemCount = _videos.length + (_hasMore ? 1 : 0);

          return GridView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              crossAxisSpacing: 16,
              mainAxisSpacing: 12,
              childAspectRatio: 1.05,
            ),
            itemCount: itemCount,
            itemBuilder: (context, index) {
              if (index >= _videos.length) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              final video = _videos[index];
              return WebVideoCard(
                video: video,
                api: api,
                onTap: () => widget.onVideoTap(video),
              );
            },
          );
        },
      ),
    );
  }
}
