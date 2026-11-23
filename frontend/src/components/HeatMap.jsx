import { useState } from "react";
import HeatMap from "@uiw/react-heat-map";

// Placeholder activity data — this app doesn't track real commit history yet,
// so we illustrate the heatmap with a realistic (current) date range instead
// of leaving it pointed at a hardcoded date from the past.
const generateActivityData = (startDate, endDate) => {
  const data = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    data.push({
      date: currentDate.toISOString().split("T")[0],
      count: Math.floor(Math.random() * 10)
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return data;
};

const oneYearAgo = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date;
};

const HeatMapProfile = () => {
  // Lazy initialisers run once on mount, so the random data stays stable
  // across re-renders.
  const [startDate] = useState(oneYearAgo);
  const [activityData] = useState(() => generateActivityData(startDate, new Date()));

  return (
    <div>
      <h4>Recent Contributions</h4>
      <HeatMap
        className="HeatMapProfile"
        style={{ maxWidth: "700px", height: "200px", color: "white" }}
        value={activityData}
        weekLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
        startDate={startDate}
        rectSize={15}
        space={3}
        rectProps={{ rx: 2.5 }}
        panelColors={{ 0: "#161b22", 2: "#0e4429", 4: "#006d32", 6: "#26a641", 8: "#39d353" }}
      />
    </div>
  );
};

export default HeatMapProfile;
