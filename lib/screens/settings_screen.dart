import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../services/p2p_service.dart';
import '../theme/colors.dart';
import '../widgets/angular_container.dart';
import '../widgets/connection_indicator.dart';

/// Settings screen showing node identity, username, and network status.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _usernameController = TextEditingController();
  bool _checkingUsername = false;
  bool? _usernameAvailable;
  String? _usernameError;
  bool _claimingUsername = false;

  @override
  void dispose() {
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _checkUsername(P2pService p2p) async {
    final name = _usernameController.text.trim();
    if (name.isEmpty) return;

    setState(() {
      _checkingUsername = true;
      _usernameAvailable = null;
      _usernameError = null;
    });

    try {
      final result = await p2p.checkUsername(name);
      if (!mounted) return;
      final available = result['available'] as bool? ?? false;
      final ownedByUs = result['ownedByUs'] as bool? ?? false;
      setState(() {
        _usernameAvailable = available || ownedByUs;
        _checkingUsername = false;
        if (!available && !ownedByUs) {
          _usernameError = 'Already taken';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _checkingUsername = false;
        _usernameError = e.toString();
      });
    }
  }

  Future<void> _claimUsername(P2pService p2p) async {
    final name = _usernameController.text.trim();
    if (name.isEmpty) return;

    setState(() {
      _claimingUsername = true;
      _usernameError = null;
    });

    try {
      await p2p.setUsername(name);
      if (!mounted) return;
      setState(() {
        _claimingUsername = false;
        _usernameAvailable = null;
        _usernameController.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Username set to "$name"'),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _claimingUsername = false;
        _usernameError = e.toString();
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
          'Settings',
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
      body: Consumer<P2pService>(
        builder: (context, p2p, _) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Connection status
                AngularContainer(
                  cutSize: 14,
                  color: SpillColors.surface,
                  child: Row(
                    children: [
                      ConnectionIndicator(
                        connected: p2p.connected,
                        size: 14,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        p2p.connected ? 'Connected' : 'Disconnected',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              color: p2p.connected
                                  ? SpillColors.success
                                  : SpillColors.error,
                            ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Node identity
                _SectionHeader(title: 'Node Identity'),
                const SizedBox(height: 8),
                AngularContainer(
                  cutSize: 10,
                  color: SpillColors.surface,
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Public Key',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              p2p.nodeId ?? 'Not available',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    fontFamily: 'JetBrains Mono',
                                    color: p2p.nodeId != null
                                        ? SpillColors.textPrimary
                                        : SpillColors.textSecondary,
                                  ),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 2,
                            ),
                          ),
                          if (p2p.nodeId != null)
                            IconButton(
                              icon: const Icon(Icons.copy, size: 16),
                              onPressed: () {
                                Clipboard.setData(
                                  ClipboardData(text: p2p.nodeId!),
                                );
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Public key copied'),
                                    duration: Duration(seconds: 2),
                                  ),
                                );
                              },
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Username
                _SectionHeader(title: 'Username'),
                const SizedBox(height: 8),
                AngularContainer(
                  cutSize: 10,
                  color: SpillColors.surface,
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.person_outline,
                            size: 16,
                            color: p2p.username != null
                                ? SpillColors.accent
                                : SpillColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            p2p.username ?? 'Not set',
                            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: p2p.username != null
                                      ? SpillColors.textPrimary
                                      : SpillColors.textSecondary,
                                ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _usernameController,
                              style: Theme.of(context).textTheme.bodySmall,
                              decoration: InputDecoration(
                                hintText: 'Enter username',
                                hintStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: SpillColors.textSecondary,
                                    ),
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: BorderSide(color: SpillColors.divider),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: BorderSide(color: SpillColors.divider),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: BorderSide(color: SpillColors.accent),
                                ),
                                suffixIcon: _checkingUsername || _claimingUsername
                                    ? const Padding(
                                        padding: EdgeInsets.all(10),
                                        child: SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        ),
                                      )
                                    : _usernameAvailable != null
                                        ? Icon(
                                            _usernameAvailable!
                                                ? Icons.check_circle_outline
                                                : Icons.cancel_outlined,
                                            size: 18,
                                            color: _usernameAvailable!
                                                ? SpillColors.success
                                                : SpillColors.error,
                                          )
                                        : null,
                              ),
                              onChanged: (_) {
                                if (_usernameAvailable != null || _usernameError != null) {
                                  setState(() {
                                    _usernameAvailable = null;
                                    _usernameError = null;
                                  });
                                }
                              },
                            ),
                          ),
                          const SizedBox(width: 8),
                          AngularButton(
                            label: 'Check',
                            onPressed: _checkingUsername || _claimingUsername || !p2p.connected
                                ? null
                                : () => _checkUsername(p2p),
                          ),
                        ],
                      ),
                      if (_usernameError != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          _usernameError!,
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: SpillColors.error,
                              ),
                        ),
                      ],
                      if (_usernameAvailable == true) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Text(
                              'Available!',
                              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: SpillColors.success,
                                  ),
                            ),
                            const Spacer(),
                            AngularButton(
                              label: 'Claim',
                              icon: Icons.check,
                              onPressed: _claimingUsername
                                  ? null
                                  : () => _claimUsername(p2p),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Network stats
                _SectionHeader(title: 'Network'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        label: 'Videos',
                        value: '${p2p.videos.length}',
                        icon: Icons.videocam_outlined,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'Status',
                        value: p2p.connected ? 'Online' : 'Offline',
                        icon: Icons.wifi,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // App info
                _SectionHeader(title: 'Application'),
                const SizedBox(height: 8),
                AngularContainer(
                  cutSize: 10,
                  color: SpillColors.surface,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _InfoRow(label: 'Version', value: '1.0.0'),
                      const Divider(height: 16),
                      _InfoRow(label: 'Runtime', value: 'Bare + Holepunch'),
                      const Divider(height: 16),
                      _InfoRow(label: 'Protocol', value: 'Hyperswarm'),
                    ],
                  ),
                ),

                // Error display
                if (p2p.error != null) ...[
                  const SizedBox(height: 24),
                  AngularContainer(
                    cutSize: 10,
                    color: SpillColors.error.withValues(alpha: 0.1),
                    borderColor: SpillColors.error,
                    child: Text(
                      p2p.error!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: SpillColors.error,
                          ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: SpillColors.accent,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: SpillColors.textSecondary,
              ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return AngularContainer(
      cutSize: 10,
      color: SpillColors.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: SpillColors.textSecondary),
          const SizedBox(height: 8),
          Text(value, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 2),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        Text(value, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
