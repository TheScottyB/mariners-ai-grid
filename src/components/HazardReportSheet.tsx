/**
 * Mariner's AI Grid - HazardReportSheet
 * Glove-friendly reporting interface for the "Waze" social layer.
 *
 * Design principles:
 * - Large touch targets (min 100px)
 * - High-contrast colors for dark cockpit
 * - Haptic feedback on submission
 * - Automatic sensor enrichment
 */

import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';

import { HazardService, HazardType } from '../services/HazardService';
import { getDeviceId } from '../services/IdentityService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HazardOption {
  type: HazardType;
  icon: string;
  label: string;
  color: string;
  description: string;
}

const HAZARD_OPTIONS: HazardOption[] = [
  {
    type: 'debris',
    icon: '🚧',
    label: 'DEBRIS',
    color: '#FF4500',
    description: 'Floating container, log, or obstruction',
  },
  {
    type: 'surge',
    icon: '🌊',
    label: 'SURGE',
    color: '#1E90FF',
    description: 'Dangerous wave or swell conditions',
  },
  {
    type: 'squall',
    icon: '🌪️',
    label: 'SQUALL',
    color: '#FFD700',
    description: 'Sudden storm or weather cell',
  },
  {
    type: 'fuel_ice',
    icon: '⛽',
    label: 'FUEL/ICE',
    color: '#32CD32',
    description: 'Fuel dock or ice available',
  },
  {
    type: 'whale',
    icon: '🐋',
    label: 'WHALE',
    color: '#9370DB',
    description: 'Marine mammal sighting',
  },
  {
    type: 'fishing_gear',
    icon: '🎣',
    label: 'NETS/POTS',
    color: '#FF6347',
    description: 'Fishing gear, crab pots, or nets',
  },
  {
    type: 'shallow',
    icon: '⚠️',
    label: 'SHALLOW',
    color: '#FF1493',
    description: 'Uncharted shallow or reef',
  },
  {
    type: 'anchorage',
    icon: '⚓',
    label: 'ANCHORAGE',
    color: '#00CED1',
    description: 'Good anchorage found',
  },
];

export interface HazardReportSheetRef {
  present: (location?: { lat: number; lon: number }) => void;
  dismiss: () => void;
}

interface HazardReportSheetProps {
  /** Current vessel location (used if no specific location provided) */
  vesselLocation: { lat: number; lng: number };
  /** Callback when hazard is successfully reported */
  onHazardReported?: (type: HazardType, lat: number, lon: number) => void;
}

export const HazardReportSheet = forwardRef<HazardReportSheetRef, HazardReportSheetProps>(
  ({ vesselLocation, onHazardReported }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    const db = useSQLiteContext();
    const [reportLocation, setReportLocation] = React.useState<{ lat: number; lon: number } | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Snap points for the bottom sheet
    const snapPoints = useMemo(() => ['50%', '75%'], []);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      present: (location) => {
        setReportLocation(location ?? { lat: vesselLocation.lat, lon: vesselLocation.lng });
        sheetRef.current?.snapToIndex(0);
      },
      dismiss: () => {
        sheetRef.current?.close();
        setReportLocation(null);
      },
    }));

    // Backdrop renderer
    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.7}
        />
      ),
      []
    );

    // Handle hazard submission
    const handleReport = useCallback(
      async (option: HazardOption) => {
        if (isSubmitting || !reportLocation) return;

        setIsSubmitting(true);

        try {
          // Trigger haptic feedback
          if (Platform.OS !== 'web') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          // Get device ID for reporter attribution
          const deviceId = await getDeviceId();

          // Initialize hazard service and report
          const hazardService = new HazardService(db, deviceId);
          await hazardService.initSchema();

          const report = await hazardService.reportHazard(
            option.type,
            reportLocation.lat,
            reportLocation.lon,
            option.description
          );

          console.log(`✅ Hazard reported: ${option.label} at ${reportLocation.lat.toFixed(4)}, ${reportLocation.lon.toFixed(4)}`);

          // Notify parent
          onHazardReported?.(option.type, reportLocation.lat, reportLocation.lon);

          // Close sheet
          sheetRef.current?.close();
          setReportLocation(null);
        } catch (error) {
          console.error('Failed to report hazard:', error);
          // Error haptic
          if (Platform.OS !== 'web') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        } finally {
          setIsSubmitting(false);
        }
      },
      [db, reportLocation, isSubmitting, onHazardReported]
    );

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetView style={styles.contentContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Help the Fleet</Text>
            <Text style={styles.headerSubtitle}>
              Your report helps sailors nearby. Sensor data is automatically attached.
            </Text>
          </View>

          {/* Hazard Grid */}
          <View style={styles.grid}>
            {HAZARD_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.type}
                style={[
                  styles.hazardItem,
                  { borderColor: option.color },
                  isSubmitting && styles.hazardItemDisabled,
                ]}
                onPress={() => handleReport(option)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.hazardIcon}>{option.icon}</Text>
                <Text style={[styles.hazardLabel, { color: option.color }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Location Info */}
          {reportLocation && (
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>
                📍 {reportLocation.lat.toFixed(4)}°, {reportLocation.lon.toFixed(4)}°
              </Text>
            </View>
          )}

          {/* The Mariner's Code */}
          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>
              ⚓ The Mariner's Code: Report hazards. Protect the fleet.
            </Text>
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

HazardReportSheet.displayName = 'HazardReportSheet';

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#1A1A1B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: '#666',
    width: 40,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  hazardItem: {
    width: (SCREEN_WIDTH - 76) / 2, // 2 columns with gaps
    minHeight: 100,
    borderWidth: 3,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: 16,
  },
  hazardItemDisabled: {
    opacity: 0.5,
  },
  hazardIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  hazardLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  locationInfo: {
    marginTop: 20,
    alignItems: 'center',
  },
  locationText: {
    color: '#666',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeContainer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  codeText: {
    color: '#FFB300', // Signal Amber
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default HazardReportSheet;
