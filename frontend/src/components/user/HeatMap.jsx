import { useEffect, useState } from "react";
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

const HeatMapProfile = () => {
  const [activityData, setActivityData] = useState([]);

  useEffect(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    setActivityData(generateActivityData(startDate, endDate));
  }, []);

  return (
    <div>
      <h4>Recent Contributions</h4>
      <HeatMap
        className="HeatMapProfile"
        style={{ maxWidth: "700px", height: "200px", color: "white" }}
        value={activityData}
        weekLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
        startDate={new Date(new Date().setFullYear(new Date().getFullYear() - 1))}
        rectSize={15}
        space={3}
        rectProps={{ rx: 2.5 }}
        panelColors={{ 0: "#161b22", 2: "#0e4429", 4: "#006d32", 6: "#26a641", 8: "#39d353" }}
      />
    </div>
  );
};

export default HeatMapProfile;
