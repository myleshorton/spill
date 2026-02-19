import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/video_meta.dart';
import '../services/p2p_service.dart';
import '../theme/colors.dart';
import '../widgets/connection_indicator.dart';
import '../models/categories.dart';
import '../widgets/video_card.dart';

/// Main screen with Popular and Recent tabs + category filter.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  String? _selectedCategory;
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _setCategory(String? category) {
    setState(() => _selectedCategory = category);
    // Navigate to the Popular tab (index 0) when a category is selected
    if (category != null) {
      _tabController.animateTo(0);
    }
  }

  void _onSearch() {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;
    setState(() => _isSearching = true);
    context.read<P2pService>().searchContent(query);
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _isSearching = false);
    context.read<P2pService>().clearSearch();
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
            Consumer<P2pService>(
              builder: (context, p2p, _) => ConnectionIndicator(
                connected: p2p.connected,
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
              context.read<P2pService>().refreshVideos(category: _selectedCategory);
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
          preferredSize: Size.fromHeight(_isSearching ? 56 : 137),
          child: Column(
            children: [
              // Search bar
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: SpillColors.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Search content...',
                    hintStyle: TextStyle(color: SpillColors.textSecondary),
                    prefixIcon: const Icon(Icons.search, color: SpillColors.textSecondary),
                    suffixIcon: _isSearching
                        ? IconButton(
                            icon: const Icon(Icons.close, color: SpillColors.textSecondary),
                            onPressed: _clearSearch,
                          )
                        : null,
                    filled: true,
                    fillColor: SpillColors.surfaceLight,
                    contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _onSearch(),
                ),
              ),
              // Category pills + tabs (hidden during search)
              if (!_isSearching) ...[
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
            ],
          ),
        ),
      ),
      body: _isSearching
          ? Consumer<P2pService>(
              builder: (context, p2p, _) {
                if (p2p.searching && p2p.searchResults.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (p2p.searchResults.isEmpty) {
                  return const _EmptyState(
                    message: 'No results found',
                    detail: 'Try different keywords or\nwait for more peers to connect.',
                  );
                }
                return _PaginatedGrid(
                  scrollController: ScrollController(),
                  videos: p2p.searchResults,
                  hasMore: p2p.searching,
                );
              },
            )
          : TabBarView(
              controller: _tabController,
              children: [
                _PopularTab(
                  key: ValueKey('popular-$_selectedCategory'),
                  category: _selectedCategory,
                ),
                _RecentTab(
                  key: ValueKey('recent-$_selectedCategory'),
                  category: _selectedCategory,
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
}

// ---------------------------------------------------------------------------
// Recent tab — paginated from Hyperbee index, filtered by category
// ---------------------------------------------------------------------------

class _RecentTab extends StatefulWidget {
  final String? category;

  const _RecentTab({super.key, this.category});

  @override
  State<_RecentTab> createState() => _RecentTabState();
}

class _RecentTabState extends State<_RecentTab>
    with AutomaticKeepAliveClientMixin {
  final ScrollController _scrollController = ScrollController();
  final List<VideoMeta> _videos = [];
  String? _cursor;
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
      final p2p = context.read<P2pService>();
      final result = await p2p.getRecentVideos(
        limit: 20,
        cursor: _cursor,
        category: widget.category,
      );
      final newVideos = result['videos'] as List<VideoMeta>;
      final newCursor = result['cursor'] as String?;

      if (mounted) {
        setState(() {
          _videos.addAll(newVideos);
          _cursor = newCursor;
          _hasMore = newCursor != null;
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
      _cursor = null;
      _hasMore = true;
      _initialLoad = true;
    });
    await _loadMore();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    if (_initialLoad && _loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_videos.isEmpty && !_loading) {
      return _EmptyState(
        message: 'No recent files',
        detail: widget.category != null
            ? 'No recent files in this category.'
            : 'Files you discover will appear here\nand persist across restarts.',
      );
    }

    return RefreshIndicator(
      color: SpillColors.accent,
      backgroundColor: SpillColors.surface,
      onRefresh: _refresh,
      child: _PaginatedGrid(
        scrollController: _scrollController,
        videos: _videos,
        hasMore: _hasMore,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Popular tab — sorted by peer count, filtered by category
// ---------------------------------------------------------------------------

class _PopularTab extends StatefulWidget {
  final String? category;

  const _PopularTab({super.key, this.category});

  @override
  State<_PopularTab> createState() => _PopularTabState();
}

class _PopularTabState extends State<_PopularTab>
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
      final p2p = context.read<P2pService>();
      final result = await p2p.getPopularVideos(
        limit: 20,
        offset: _offset,
        category: widget.category,
      );
      final newVideos = result['videos'] as List<VideoMeta>;
      final hasMore = result['hasMore'] as bool;

      if (mounted) {
        setState(() {
          _videos.addAll(newVideos);
          _offset += newVideos.length;
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

  @override
  Widget build(BuildContext context) {
    super.build(context);

    if (_initialLoad && _loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_videos.isEmpty && !_loading) {
      return _EmptyState(
        message: 'No popular files',
        detail: widget.category != null
            ? 'No popular files in this category.'
            : 'Files with active peers will\nappear here ranked by popularity.',
      );
    }

    return RefreshIndicator(
      color: SpillColors.accent,
      backgroundColor: SpillColors.surface,
      onRefresh: _refresh,
      child: _PaginatedGrid(
        scrollController: _scrollController,
        videos: _videos,
        hasMore: _hasMore,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared paginated grid
// ---------------------------------------------------------------------------

class _PaginatedGrid extends StatelessWidget {
  final ScrollController scrollController;
  final List<VideoMeta> videos;
  final bool hasMore;

  const _PaginatedGrid({
    required this.scrollController,
    required this.videos,
    required this.hasMore,
  });

  int _crossAxisCount(double width) {
    if (width < 600) return 1;
    if (width < 900) return 2;
    if (width < 1200) return 3;
    return 4;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = _crossAxisCount(constraints.maxWidth);
        final itemCount = videos.length + (hasMore ? 1 : 0);

        return GridView.builder(
          controller: scrollController,
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 16,
            mainAxisSpacing: 12,
            childAspectRatio: 1.05,
          ),
          itemCount: itemCount,
          itemBuilder: (context, index) {
            if (index >= videos.length) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              );
            }
            final video = videos[index];
            return VideoCard(
              video: video,
              onTap: () =>
                  context.go('/player/${video.id}', extra: video),
            );
          },
        );
      },
    );
  }
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

// ---------------------------------------------------------------------------
// Shared empty state
// ---------------------------------------------------------------------------

class _EmptyState extends StatelessWidget {
  final String message;
  final String detail;

  const _EmptyState({required this.message, required this.detail});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.folder_off_outlined,
              size: 64,
              color: SpillColors.textSecondary.withValues(alpha: 0.4),
            ),
            const SizedBox(height: 24),
            Text(
              message,
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              detail,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: SpillColors.textSecondary,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
