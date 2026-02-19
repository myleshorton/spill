import 'package:flutter/material.dart';
import 'colors.dart';
import 'typography.dart';

class SpillTheme {
  SpillTheme._();

  static ThemeData get dark {
    return ThemeData.light().copyWith(
      scaffoldBackgroundColor: SpillColors.background,
      colorScheme: const ColorScheme.light(
        primary: SpillColors.accent,
        secondary: SpillColors.accentSecondary,
        surface: SpillColors.surface,
        error: SpillColors.error,
        onPrimary: Colors.white,
        onSecondary: SpillColors.textPrimary,
        onSurface: SpillColors.textPrimary,
        onError: Colors.white,
      ),
      textTheme: SpillTypography.textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: SpillColors.background,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: SpillTypography.textTheme.headlineMedium,
        iconTheme: const IconThemeData(color: SpillColors.textPrimary),
      ),
      cardTheme: CardThemeData(
        color: SpillColors.surface,
        elevation: 1,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: SpillColors.accent,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: SpillColors.textPrimary,
          side: const BorderSide(color: SpillColors.accent),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SpillColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: SpillColors.divider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: SpillColors.divider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: SpillColors.accent, width: 2),
        ),
        labelStyle: const TextStyle(color: SpillColors.textSecondary),
        hintStyle: const TextStyle(color: SpillColors.textSecondary),
      ),
      dividerTheme: const DividerThemeData(
        color: SpillColors.divider,
        thickness: 1,
      ),
      iconTheme: const IconThemeData(
        color: SpillColors.textSecondary,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: SpillColors.surface,
        selectedItemColor: SpillColors.accent,
        unselectedItemColor: SpillColors.textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: SpillColors.accent,
        linearTrackColor: SpillColors.surfaceLight,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: SpillColors.surfaceLight,
        contentTextStyle: const TextStyle(color: SpillColors.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
