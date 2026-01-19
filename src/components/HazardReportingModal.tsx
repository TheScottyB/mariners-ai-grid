/**
 * Mariner's AI Grid - Hazard Reporting Modal
 * Part of the "Waze for Sailors" social layer.
 * Allows users to submit crowdsourced reports for debris, whales, etc.
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MarineHazard } from '../utils/geoUtils';

export interface HazardReportingModalProps {
  visible: boolean;
  location: { lat: number; lng: number } | null;
  onClose: () => void;
  onSubmit: (hazard: Partial<MarineHazard>) => void;
}

const HAZARD_TYPES: { label: string; value: MarineHazard['type']; icon: string }[] = [
  { label: 'Debris / Log', value: 'debris', icon: '🪵' },
  { label: 'Heavy Surge', value: 'surge', icon: '🌊' },
  { label: 'Whale / Mammal', value: 'whale', icon: '🐋' },
  { label: 'Fishing Gear', value: 'fishing_gear', icon: '🎣' },
  { label: 'Shallow Area', value: 'shallow', icon: '⚠️' },
  { label: 'Other Hazard', value: 'other', icon: '❓' },
];

export const HazardReportingModal: React.FC<HazardReportingModalProps> = ({
  visible,
  location,
  onClose,
  onSubmit,
}) => {
  const [selectedType, setSelectedType] = useState<MarineHazard['type']>('debris');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!location) return;

    onSubmit({
      type: selectedType,
      description,
      lat: location.lat,
      lon: location.lng,
      reportedAt: Date.now(),
      verified: false,
      confidence: 0.5,
    });
    
    // Reset and close
    setDescription('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        <View style={styles.modalView}>
          <View style={styles.header}>
            <Text style={styles.modalTitle}>Report Hazard</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {location && (
            <Text style={styles.locationText}>
              Location: {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
            </Text>
          )}

          <Text style={styles.sectionLabel}>Select Type</Text>
          <View style={styles.typeGrid}>
            {HAZARD_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.typeItem,
                  selectedType === type.value && styles.typeItemActive,
                ]}
                onPress={() => setSelectedType(type.value)}
              >
                <Text style={styles.typeIcon}>{type.icon}</Text>
                <Text style={[
                  styles.typeLabel,
                  selectedType === type.value && styles.typeLabelActive
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Description (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Large semi-submerged shipping container"
            placeholderTextColor="#666"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>Broadcast to Grid</Text>
          </TouchableOpacity>
          
          <Text style={styles.disclaimer}>
            Your report will be shared with all vessels in the grid. 
            Maintain your trust score by reporting accurately.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    backgroundColor: '#001B3A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#E0F7FA',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#81D4FA',
    fontSize: 20,
  },
  locationText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  sectionLabel: {
    color: '#81D4FA',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  typeItem: {
    width: '31%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeItemActive: {
    backgroundColor: 'rgba(0, 191, 255, 0.2)',
    borderColor: '#00BFFF',
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  typeLabelActive: {
    color: '#00BFFF',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  submitButton: {
    backgroundColor: '#00BFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonText: {
    color: '#001B3A',
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  disclaimer: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
