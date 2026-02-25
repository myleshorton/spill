import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'colors.dart';

class SpillTypography {
  SpillTypography._();

  static TextTheme get textTheme {
    return TextTheme(
      displayLarge: GoogleFonts.sora(
        fontSize: 52,
        fontWeight: FontWeight.w600,
        letterSpacing: -1.0,
        color: SpillColors.textPrimary,
      ),
      displayMedium: GoogleFonts.sora(
        fontSize: 40,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.8,
        color: SpillColors.textPrimary,
      ),
      displaySmall: GoogleFonts.sora(
        fontSize: 30,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.5,
        color: SpillColors.textPrimary,
      ),
      headlineLarge: GoogleFonts.sora(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.5,
        color: SpillColors.textPrimary,
      ),
      headlineMedium: GoogleFonts.sora(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
        color: SpillColors.textPrimary,
      ),
      headlineSmall: GoogleFonts.sora(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
        color: SpillColors.textPrimary,
      ),
      titleLarge: GoogleFonts.plusJakartaSans(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
        color: SpillColors.textPrimary,
      ),
      titleMedium: GoogleFonts.plusJakartaSans(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: SpillColors.textPrimary,
      ),
      titleSmall: GoogleFonts.plusJakartaSans(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: SpillColors.textSecondary,
      ),
      bodyLarge: GoogleFonts.plusJakartaSans(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: SpillColors.textPrimary,
      ),
      bodyMedium: GoogleFonts.plusJakartaSans(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: SpillColors.textPrimary,
      ),
      bodySmall: GoogleFonts.plusJakartaSans(
        fontSize: 11,
        fontWeight: FontWeight.w400,
        color: SpillColors.textSecondary,
      ),
      labelLarge: GoogleFonts.plusJakartaSans(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
        color: SpillColors.textPrimary,
      ),
      labelMedium: GoogleFonts.plusJakartaSans(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: SpillColors.textSecondary,
      ),
      labelSmall: GoogleFonts.plusJakartaSans(
        fontSize: 10,
        fontWeight: FontWeight.w400,
        color: SpillColors.textSecondary,
      ),
    );
  }
}
