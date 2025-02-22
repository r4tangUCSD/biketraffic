// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoicjR0YW5nIiwiYSI6ImNtN2ZxdHFjNDBzcW0ybG9vNTYxZnczeTcifQ.7-jpF_dLaKqHHj_E6Pgnww';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/light-v11', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': '#32D800',
          'line-width': 2,
          'line-opacity': 0.4
        }
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    
    });
    map.addLayer({
        id: 'cam-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
          'line-color': '#32D800',
          'line-width': 2,
          'line-opacity': 0.4
        }
    });
});

const svg = d3.select('#map').select('svg');
let stations = [];

// Define the quantize scale for traffic flow
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

map.on('load', () => {
    // Load the nested JSON file
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  // Log to verify structure
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        let circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('stroke', 'white')    // Circle border color
            .attr('stroke-width', 1)    // Circle border thickness
            .attr('opacity', 0.8)       // Circle opacity
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)); // Set color based on traffic flow

        // Initial position update when map loads
        updatePositions();

        // Function to update circle positions when the map moves/zooms
        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
                .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
        }

        // Reposition markers on map interactions
        map.on('move', updatePositions);     // Update during map movement
        map.on('zoom', updatePositions);     // Update during zooming
        map.on('resize', updatePositions);   // Update on window resize
        map.on('moveend', updatePositions);  // Final adjustment after movement ends

        // Load the CSV file
        const csvurl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
        d3.csv(csvurl).then(csvData => {
            console.log('Loaded CSV Data:', csvData);  // Log to verify structure
            const trips = csvData;

            // Convert trip times to Date objects
            for (let trip of trips) {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
            }

            // Calculate initial arrivals and departures
            let departures = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.start_station_id,
            );

            let arrivals = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.end_station_id,
            );

            stations = stations.map((station) => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            console.log('Stations Array:', stations);

            // Define the radius scale
            const radiusScale = d3
                .scaleSqrt()
                .domain([0, d3.max(stations, (d) => d.totalTraffic)])
                .range([0, 25]);

            circles.attr('r', d => radiusScale(d.totalTraffic));

            circles.each(function(d) {
                d3.select(this)
                    .append('title')
                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });

            let filteredTrips = [];
            let filteredArrivals = new Map();
            let filteredDepartures = new Map();
            let filteredStations = [];

            // Function to filter trips by time
            function filterTripsbyTime() {
                filteredTrips = timeFilter === -1
                    ? trips
                    : trips.filter((trip) => {
                        const startedMinutes = minutesSinceMidnight(trip.started_at);
                        const endedMinutes = minutesSinceMidnight(trip.ended_at);
                        return (
                          Math.abs(startedMinutes - timeFilter) <= 60 ||
                          Math.abs(endedMinutes - timeFilter) <= 60
                        );
                    });

                // Update the station data based on filtered trips
                filteredDepartures = d3.rollup(
                    filteredTrips,
                    (v) => v.length,
                    (d) => d.start_station_id,
                );

                filteredArrivals = d3.rollup(
                    filteredTrips,
                    (v) => v.length,
                    (d) => d.end_station_id,
                );

                filteredStations = stations.map((station) => {
                    station = { ...station }; // Clone the station object
                    let id = station.short_name;
                    station.arrivals = filteredArrivals.get(id) ?? 0;
                    station.departures = filteredDepartures.get(id) ?? 0;
                    station.totalTraffic = station.arrivals + station.departures;
                    return station;
                });

                // Update the radius scale conditionally
                const radiusScale = d3
                    .scaleSqrt()
                    .domain([0, d3.max(filteredStations, (d) => d.totalTraffic)])
                    .range(timeFilter === -1 ? [0, 25] : [3, 50]);

                // Update the radius of the circles based on total traffic
                circles
                    .data(filteredStations)
                    .attr('r', d => radiusScale(d.totalTraffic))
                    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)); // Update color based on traffic flow

                // Update tooltips
                circles.each(function(d) {
                    d3.select(this)
                        .select('title')
                        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                });

                // Update positions
                updatePositions();
            }

            // Initial filtering
            filterTripsbyTime();

            // Add event listener to the time slider
            const timeSlider = document.getElementById('time-filter');
            const selectedTime = document.getElementById('selected-time');
            const anyTimeLabel = document.getElementById('any-time');

            function formatTime(minutes) {
                const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
                return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
            }

            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);  // Get slider value

                if (timeFilter === -1) {
                    selectedTime.textContent = '';  // Clear time display
                    anyTimeLabel.style.display = 'block';  // Show "(any time)"
                } else {
                    selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
                    anyTimeLabel.style.display = 'none';  // Hide "(any time)"
                }

                // Trigger filtering logic
                filterTripsbyTime();
            }

            timeSlider.addEventListener('input', updateTimeDisplay);
            updateTimeDisplay();

        }).catch(error => {
            console.error('Error loading CSV:', error);  // Handle errors if CSV loading fails
        });

    }).catch(error => {
        console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
    });
});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

let timeFilter = -1;
const timeSlider = document.getElementById('time-filter');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value);  // Get slider value
  
    if (timeFilter === -1) {
      selectedTime.textContent = '';  // Clear time display
      anyTimeLabel.style.display = 'block';  // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
      anyTimeLabel.style.display = 'none';  // Hide "(any time)"
    }
  
    // Trigger filtering logic
    filterTripsbyTime();
}

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}