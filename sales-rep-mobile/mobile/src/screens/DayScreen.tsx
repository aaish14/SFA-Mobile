import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { post } from "../api/client";

const transportModes = ["Two Wheeler", "Four Wheeler", "Bus", "Train", "Auto", "Other"];
const ownershipOptions = ["Own", "Company", "Public"];
const plannedActivities = ["Outlet Visits", "Office Work", "Market Survey", "Other"];
const odometerEntryModes = ["Manual", "GPS Assisted"];

type TravelSummary = {
  distanceTravelledKm: number;
  ratePerKm: number;
  totalTravelAmount: number;
};

/**
 * Manage start/end odometer entry, GPS capture and the server-calculated travel summary.
 */
export default function DayScreen() {
  const [transportMode, setTransportMode] = useState("Two Wheeler");
  const [ownership, setOwnership] = useState("Own");
  const [plannedActivity, setPlannedActivity] = useState("Outlet Visits");
  const [entryMode, setEntryMode] = useState("Manual");
  const [startOdometer, setStartOdometer] = useState("");
  const [endOdometer, setEndOdometer] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [travelSummary, setTravelSummary] = useState<TravelSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTravelSummary(null);
  }, [startOdometer, endOdometer]);

  /**
   * Request foreground location permission and return a high-accuracy GPS coordinate, failing
   * when permission is denied.
   */
  async function captureLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Location permission is required for odometer tracking.");
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  }

  /**
   * Validate the starting odometer and send location/travel details to create the attendance
   * record.
   */
  async function startDay() {
    if (!startOdometer || Number(startOdometer) < 0) {
      Alert.alert("Start odometer required", "Enter a valid starting odometer reading.");
      return;
    }

    try {
      setBusy(true);
      const location = await captureLocation();
      const result = await post<{ attendanceId: string }>("/day/start", {
        location,
        transportMode,
        ownership,
        plannedActivity,
        startOdometer: Number(startOdometer),
        odometerEvidenceUrl: evidenceUrl.trim(),
        odometerEntryMode: entryMode,
      });
      setAttendanceId(result.attendanceId);
      Alert.alert("Odometer started", "The starting reading was saved in Salesforce.");
    } catch (error) {
      Alert.alert(
        "Unable to start odometer",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Validate the ending odometer, submit a stable attendance request ID and display the
   * server-calculated travel reimbursement.
   */
  async function endDay() {
    if (!attendanceId) {
      Alert.alert("Start first", "Start the odometer before recording the ending reading.");
      return;
    }
    if (!endOdometer || Number(endOdometer) < Number(startOdometer)) {
      Alert.alert(
        "Invalid ending reading",
        "End odometer must be greater than or equal to start odometer.",
      );
      return;
    }

    try {
      setBusy(true);
      const location = await captureLocation();
      const result = await post<TravelSummary>("/day/end", {
        location,
        endOdometer: Number(endOdometer),
        odometerEvidenceUrl: evidenceUrl.trim(),
        requestId: `end-${attendanceId}`,
      });
      setTravelSummary({
        distanceTravelledKm: Number(result.distanceTravelledKm || 0),
        ratePerKm: Number(result.ratePerKm || 0),
        totalTravelAmount: Number(result.totalTravelAmount || 0),
      });
      Alert.alert(
        "Odometer ended",
        "Salesforce calculated the travelled distance and total amount.",
      );
    } catch (error) {
      Alert.alert("Unable to end odometer", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Render selectable travel options and pass the selected value to the parent form.
   */
  function ChoiceRow({
    values,
    selected,
    onSelect,
  }: {
    values: string[];
    selected: string;
    onSelect: (value: string) => void;
  }) {
    return (
      <View style={styles.choiceRow}>
        {values.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.choice, selected === value && styles.choiceSelected]}
            onPress={() => onSelect(value)}
          >
            <Text style={[styles.choiceText, selected === value && styles.choiceTextSelected]}>
              {value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Odometer Tracking</Text>
      <Text style={styles.help}>
        Enter the vehicle dashboard reading manually. GPS Assisted mode also records your location
        as evidence.
      </Text>

      <Text style={styles.label}>Odometer entry mode</Text>
      <ChoiceRow values={odometerEntryModes} selected={entryMode} onSelect={setEntryMode} />
      <Text style={styles.label}>Transport mode</Text>
      <ChoiceRow values={transportModes} selected={transportMode} onSelect={setTransportMode} />
      <Text style={styles.label}>Vehicle ownership</Text>
      <ChoiceRow values={ownershipOptions} selected={ownership} onSelect={setOwnership} />
      <Text style={styles.label}>Planned activity</Text>
      <ChoiceRow
        values={plannedActivities}
        selected={plannedActivity}
        onSelect={setPlannedActivity}
      />

      <Text style={styles.label}>Start odometer (km)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={startOdometer}
        onChangeText={setStartOdometer}
        placeholder="Example: 12450"
        editable={!attendanceId}
      />
      <TouchableOpacity
        style={[styles.primaryButton, (busy || !!attendanceId) && styles.disabled]}
        disabled={busy || !!attendanceId}
        onPress={startDay}
      >
        <Text style={styles.primaryButtonText}>START ODOMETER</Text>
      </TouchableOpacity>

      <Text style={styles.label}>End odometer (km)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={endOdometer}
        onChangeText={setEndOdometer}
        placeholder="Example: 12525"
        editable={!!attendanceId && !travelSummary}
      />
      <Text style={styles.label}>Evidence URL (optional)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={evidenceUrl}
        onChangeText={setEvidenceUrl}
        placeholder="Receipt or odometer-photo URL"
      />
      <TouchableOpacity
        style={[
          styles.primaryButton,
          (busy || !attendanceId || !!travelSummary) && styles.disabled,
        ]}
        disabled={busy || !attendanceId || !!travelSummary}
        onPress={endDay}
      >
        <Text style={styles.primaryButtonText}>END ODOMETER</Text>
      </TouchableOpacity>

      {travelSummary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Salesforce Calculation</Text>
          <View style={styles.summaryLine}>
            <Text>Distance travelled</Text>
            <Text style={styles.summaryValue}>
              {travelSummary.distanceTravelledKm.toFixed(2)} km
            </Text>
          </View>
          <View style={styles.summaryLine}>
            <Text>Applicable rate</Text>
            <Text style={styles.summaryValue}>₹{travelSummary.ratePerKm.toFixed(2)} / km</Text>
          </View>
          <View style={styles.summaryLine}>
            <Text>Total travel amount</Text>
            <Text style={styles.totalValue}>₹{travelSummary.totalTravelAmount.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: "#f6f2e9" },
  title: { fontSize: 28, fontWeight: "800", color: "#113f3a", marginBottom: 6 },
  help: { color: "#5d7470", lineHeight: 21, marginBottom: 20 },
  label: { color: "#365b57", fontWeight: "700", marginTop: 14, marginBottom: 8 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: "#8ccbc4",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: "white",
  },
  choiceSelected: { backgroundColor: "#16867c", borderColor: "#16867c" },
  choiceText: { color: "#164b46", fontWeight: "600" },
  choiceTextSelected: { color: "white" },
  input: {
    borderWidth: 1,
    borderColor: "#c7d9d6",
    borderRadius: 12,
    backgroundColor: "white",
    padding: 14,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: "#16867c",
    borderRadius: 12,
    alignItems: "center",
    padding: 16,
    marginTop: 12,
  },
  disabled: { opacity: 0.45 },
  primaryButtonText: { color: "white", fontWeight: "800" },
  summaryCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 18,
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#cae1dd",
  },
  summaryTitle: { color: "#0d756d", fontWeight: "800", fontSize: 18, marginBottom: 12 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  summaryValue: { color: "#183f3b", fontWeight: "700" },
  totalValue: { color: "#0d756d", fontWeight: "900", fontSize: 18 },
});
