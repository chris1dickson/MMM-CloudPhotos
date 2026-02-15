#!/usr/bin/env node
/**
 * Test frontend metadata fallback logic
 * Validates that filename is shown when time or location is null
 */

console.log("\n=== Testing Metadata Fallback Logic ===\n");

// Test scenarios
const scenarios = [
  {
    name: "Both time and location available",
    photo: {
      filename: "photo1.jpg",
      creation_time: 1433065130000, // 2015-05-31
      location_name: "Singapore, Singapore"
    },
    expectedDisplay: ["10 years ago", "Singapore, Singapore"],
    shouldShowFilename: false
  },
  {
    name: "Only time available (no location)",
    photo: {
      filename: "photo2.jpg",
      creation_time: 1433065130000,
      location_name: null
    },
    expectedDisplay: ["10 years ago", "photo2.jpg"],
    shouldShowFilename: true
  },
  {
    name: "Only location available (no time)",
    photo: {
      filename: "photo3.jpg",
      creation_time: null,
      location_name: "Tokyo, Japan"
    },
    expectedDisplay: ["Tokyo, Japan", "photo3.jpg"],
    shouldShowFilename: true
  },
  {
    name: "Neither time nor location",
    photo: {
      filename: "photo4.jpg",
      creation_time: null,
      location_name: null
    },
    expectedDisplay: ["photo4.jpg"],
    shouldShowFilename: true
  }
];

// Simulate the frontend logic
function simulateFrontendDisplay(photo) {
  const display = [];
  const hasBothMetadata = photo.creation_time && photo.location_name;

  // Add photo time
  if (photo.creation_time) {
    display.push("10 years ago"); // Simplified - would use moment().fromNow()
  }

  // Add location
  if (photo.location_name) {
    display.push(photo.location_name);
  }

  // Fallback to filename if EITHER location OR date is missing
  if (!hasBothMetadata && photo.filename) {
    display.push(photo.filename);
  }

  return display;
}

// Run tests
let passed = 0;
let failed = 0;

scenarios.forEach((scenario, index) => {
  console.log(`Test ${index + 1}: ${scenario.name}`);
  console.log(`  Input:`, JSON.stringify(scenario.photo, null, 2).split('\n').join('\n  '));

  const result = simulateFrontendDisplay(scenario.photo);
  const showsFilename = result.includes(scenario.photo.filename);

  console.log(`  Expected display: ${scenario.expectedDisplay.join(", ")}`);
  console.log(`  Actual display:   ${result.join(", ")}`);
  console.log(`  Shows filename:   ${showsFilename} (expected: ${scenario.shouldShowFilename})`);

  const isCorrect = showsFilename === scenario.shouldShowFilename &&
                    result.length === scenario.expectedDisplay.length;

  if (isCorrect) {
    console.log(`  ✅ PASS\n`);
    passed++;
  } else {
    console.log(`  ❌ FAIL\n`);
    failed++;
  }
});

console.log("===========================================");
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("===========================================\n");

process.exit(failed > 0 ? 1 : 0);
