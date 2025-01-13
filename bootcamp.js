const dataDetails = {
    worksheet1_columnG: ["Employer Engagement"],
    worksheet2_columnF: ["Total Applicants"],
    worksheet3: [
        "started a SB programme",
        "completed a SB programme",
        "achieved Milestone 3",
        "the location of the employer that supported the Milestone 3 achievement"
    ]
};

// Map Initialization
const map = L.map('map').setView([52.5, 1.0], 9);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);

let currentLayer = null;
const markers = [];

// Function: Show loading overlay
function showLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex'; // Display the overlay
    } else {
        console.warn('Loading overlay element not found.');
    }
}

// Function: Hide loading overlay
function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none'; // Hide the overlay
    } else {
        console.warn('Loading overlay element not found.');
    }
}

// Populate the Data Detail dropdown
function populateDataDetailDropdown(selectedSource) {
    const dataDetailToggle = document.getElementById('dataDetailToggle');
    dataDetailToggle.innerHTML = ""; // Clear existing options

    const details = dataDetails[selectedSource];

    if (details) {
        details.forEach(detail => {
            const option = document.createElement('option');
            option.value = detail;
            option.textContent = detail;
            dataDetailToggle.appendChild(option);
        });
    } else {
        const placeholder = document.createElement('option');
        placeholder.textContent = "No details available";
        placeholder.disabled = true;
        placeholder.selected = true;
        dataDetailToggle.appendChild(placeholder);
    }
}

// Handle data source changes
const dataSourceToggle = document.getElementById('dataSourceToggle');
dataSourceToggle.addEventListener('change', () => {
    const selectedSource = dataSourceToggle.value;
    populateDataDetailDropdown(selectedSource);
});

// Populate on page load
document.addEventListener('DOMContentLoaded', () => {
    populateDataDetailDropdown(dataSourceToggle.value);
});

// Render data on the map
function renderData(data) {
    if (!data || data.length === 0) {
        console.warn("No data to render on the map.");
        return;
    }

    if (currentLayer) {
        map.removeLayer(currentLayer);
        currentLayer = null;
    }
    markers.forEach(marker => map.removeLayer(marker));
    markers.length = 0;

    const view = viewToggle.value;

    if (view === "heatmap") {
        const heatData = data.map(({ lat, lng }) => [lat, lng, 1.0]).filter(([lat, lng]) => lat && lng);
        if (heatData.length === 0) {
            console.warn("No valid heatmap data to render.");
            return;
        }
        currentLayer = L.heatLayer(heatData, {
            radius: 35,
            blur: 25,
            maxZoom: 14
        }).addTo(map);
    } else if (view === "pins") {
        data.forEach(({ lat, lng, postcode }) => {
            if (lat && lng) {
                const marker = L.marker([lat, lng]).addTo(map).bindPopup(postcode);
                markers.push(marker);
            } else {
                console.warn("Skipping invalid marker data:", { lat, lng, postcode });
            }
        });
    }
}

// File upload and processing
uploadBtn.addEventListener("click", async () => {
    if (!fileInput.files.length) {
        alert("Please select a file!");
        return;
    }

    showLoading();

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const postcodes = getPostcodes(workbook);
        const { geocodedData, missingData } = await geocodePostcodes(postcodes);
        const missingParticipants = findMissingParticipants(workbook);

        updateDataOverlay(geocodedData, missingData, missingParticipants);
        renderData(geocodedData);
        hideLoading();
    };

    reader.readAsArrayBuffer(file);
});

// Function: Update the data overlay (includes missing participants)
function updateDataOverlay(validData, missingData, missingParticipants) {
    const validCount = validData.length; // Total valid postcodes, including duplicates
    const missingCount = missingData.length; // Total missing postcodes, including duplicates
    const totalCount = validCount + missingCount;

    const overlay = document.getElementById('dataOverlay');
    if (overlay) {
        overlay.innerHTML = `
            Valid Data Points: ${validCount}<br>
            Missing Data Points: ${missingCount}<br>
            Total Data Points: ${totalCount}<br>
            Missing Participants: ${missingParticipants.length}
        `;
    } else {
        console.warn('Data overlay element not found.');
    }
}

// Function: Preprocess postcodes
function preprocessPostcodes(postcodes) {
    return postcodes
        .filter(postcode => typeof postcode === "string" && postcode.trim().length > 0) // Remove invalid values
        .map(postcode => postcode.replace(/\s+/g, '').toUpperCase()); // Clean and normalize
}


// Function: Validate postcodes
function validatePostcode(postcode) {
    const pattern = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;
    return pattern.test(postcode);
}

// Function: Geocode postcodes
async function geocodePostcodes(postcodes) {
    const geocodedData = [];
    const missingData = [];
    const cleanedPostcodes = preprocessPostcodes(postcodes);

    for (const postcode of cleanedPostcodes) {
        try {
            const response = await fetch(`https://api.postcodes.io/postcodes/${postcode}`);
            const data = await response.json();
            if (data.status === 200 && data.result) {
                geocodedData.push({ lat: data.result.latitude, lng: data.result.longitude, postcode });
            } else {
                missingData.push(postcode);
            }
        } catch (error) {
            missingData.push(postcode);
        }
    }
    return { geocodedData, missingData };
}

// Function: Find missing participants
function findMissingParticipants(workbook) {
    const worksheet2 = workbook.Sheets[workbook.SheetNames[1]];
    const worksheet3 = workbook.Sheets[workbook.SheetNames[2]];

    const applicants = XLSX.utils.sheet_to_json(worksheet2, { header: 1 })
        .map(row => row.slice(0, 4).join('|')); // Combine columns A, B, C, D

    const participants = XLSX.utils.sheet_to_json(worksheet3, { header: 1 })
        .map(row => row.slice(0, 4).join('|'));

    return applicants.filter(applicant => !participants.includes(applicant));
}

// Function: Get postcodes from the selected worksheet and detail
function getPostcodes(workbook) {
    const source = dataSourceToggle.value;
    const detail = dataDetailToggle.value;

    if (source === "worksheet1_columnG") {
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        return jsonData.map(row => row[6]).filter(Boolean); // Extract column G (index 6)
    }

    if (source === "worksheet2_columnF") {
        const worksheet = workbook.Sheets[workbook.SheetNames[1]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (detail === "Total Applicants") {
            return jsonData.map(row => row[5]).filter(Boolean); // Extract column F (index 5)
        }
    }

    if (source === "worksheet3") {
        const worksheet2 = workbook.Sheets[workbook.SheetNames[1]]; // worksheet 2
        const worksheet3 = workbook.Sheets[workbook.SheetNames[2]]; // worksheet 3

        if (detail === "started a SB programme") {
            // Display postcodes directly from worksheet 2 column F, where column AE (index 30) is "Yes"
            const postcodes = XLSX.utils.sheet_to_json(worksheet2, { header: 1 })
                .filter(row => row[30] === "Yes") // Column AE (index 30) is "Yes"
                .map(row => row[5]) // Extract column F (index 5)
                .filter(Boolean); // Ensure non-empty values

            return postcodes; // Return postcodes of those who started an SB programme
        }

        if (detail === "completed a SB programme") {
            // Cross-reference applicants with participants for "completed a SB programme"
            const applicants = XLSX.utils.sheet_to_json(worksheet2, { header: 1 })
                .map(row => ({
                    key: row.slice(0, 4).join('|'), // Combine columns A, B, C, D as a unique key
                    postcode: row[5] // Column F (index 5) for postcodes
                }));

            const participants = XLSX.utils.sheet_to_json(worksheet3, { header: 1 })
                .filter(row => row[25]) // Column Z (index 25) is not blank
                .map(row => row.slice(0, 4).join('|')); // Combine columns A, B, C, D as a unique key

            const matchedPostcodes = applicants
                .filter(applicant => participants.includes(applicant.key))
                .map(applicant => applicant.postcode);

            return matchedPostcodes.filter(Boolean); // Ensure non-empty values
        }

        if (detail === "achieved Milestone 3") {
            // Cross-reference applicants with participants for "achieved Milestone 3"
            const applicants = XLSX.utils.sheet_to_json(worksheet2, { header: 1 })
                .map(row => ({
                    key: row.slice(0, 4).join('|'), // Combine columns A, B, C, D as a unique key
                    postcode: row[5] // Column F (index 5) for postcodes
                }));

            const participants = XLSX.utils.sheet_to_json(worksheet3, { header: 1 })
                .filter(row => row[49] && row[49] !== "NA") // Column AX (index 49) is non-blank and not "NA"
                .map(row => row.slice(0, 4).join('|')); // Combine columns A, B, C, D as a unique key

            const matchedPostcodes = applicants
                .filter(applicant => participants.includes(applicant.key))
                .map(applicant => applicant.postcode);

            return matchedPostcodes.filter(Boolean); // Ensure non-empty values
        }

        if (detail === "the location of the employer that supported the Milestone 3 achievement") {
            // Extract column AQ (index 42) where column AX (index 49) is valid
            const employerLocations = XLSX.utils.sheet_to_json(worksheet3, { header: 1 })
                .filter(row => row[49] && row[49] !== "NA") // Column AX (index 49) is non-blank and not "NA"
                .map(row => row[42]) // Extract column AQ (index 42)
                .filter(Boolean); // Ensure non-empty values

            return employerLocations; // Return employer locations
        }
    }

    return [];
}