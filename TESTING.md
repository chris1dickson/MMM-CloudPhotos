# Testing Guide - MMM-GooglePhotos V3

Complete testing guide for unit tests, integration tests, and manual testing.

---

## Overview

MMM-GooglePhotos V3 includes **professional-grade testing** without requiring MagicMirror or Google Drive credentials!

### Test Types

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test components working together
3. **Standalone Tests** - End-to-end test with real Drive API
4. **Manual Tests** - Real-world testing in MagicMirror

---

## Quick Start

### Install Test Dependencies

```bash
npm install
```

This installs Jest and testing utilities.

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode (auto-rerun on changes)
npm run test:watch
```

---

## Unit Tests

**Location**: `tests/unit/`

Unit tests verify individual components work correctly in isolation.

### PhotoDatabase Tests

**File**: `tests/unit/PhotoDatabase.test.js`

Tests:
- ✅ Database initialization
- ✅ Corruption recovery (12-line recovery)
- ✅ Photo CRUD operations
- ✅ Cache management
- ✅ Display logic
- ✅ Settings storage
- ✅ LRU eviction

**Run**:
```bash
npm test -- PhotoDatabase.test.js
```

### CacheManager Tests

**File**: `tests/unit/CacheManager.test.js`

Tests:
- ✅ Cache statistics
- ✅ Graceful degradation (3-failure threshold)
- ✅ Download with retry
- ✅ Batch downloads
- ✅ Cache eviction
- ✅ Cleanup operations

**Run**:
```bash
npm test -- CacheManager.test.js
```

### Coverage

```bash
npm test -- --coverage
```

View detailed coverage report:
```bash
open coverage/lcov-report/index.html
```

**Target**: >70% coverage on all metrics

---

## Integration Tests

**Location**: `tests/integration/`

Integration tests verify components work together correctly.

### Full Workflow Tests

**File**: `tests/integration/full-workflow.test.js`

Tests complete workflows:
- ✅ Add photos → Cache → Display
- ✅ Cache eviction workflow
- ✅ Incremental caching
- ✅ Display rotation (no duplicates)
- ✅ Failure recovery
- ✅ Settings persistence

**Run**:
```bash
npm run test:integration
```

These tests use **mock Drive API**, so no credentials needed!

---

## Standalone Tests (Real Drive API)

**Location**: `test_v3_standalone.js`

This script tests with **real Google Drive API** calls.

### Prerequisites

1. ✅ `google_drive_auth.json` (OAuth credentials)
2. ✅ `token_drive.json` (run `node generate_drive_token.js`)
3. ✅ Drive folder with photos
4. ✅ Edit script with your folder ID

### Run

```bash
node test_v3_standalone.js
```

### What It Tests

12 functional tests:
1. Database initialization
2. Drive API authentication
3. Folder scanning (your real photos!)
4. Save to database
5. Cache manager init
6. Single photo download
7. Batch downloads
8. Cache statistics
9. Display logic
10. Changes API (incremental scan)
11. Cache eviction
12. Settings storage

**See**: `TEST_INSTRUCTIONS.md` for details

---

## Test Results

### Expected Output

#### Unit Tests

```
PASS  tests/unit/PhotoDatabase.test.js
  PhotoDatabase
    Initialization
      ✓ should create database file (45ms)
      ✓ should initialize with zero photos (12ms)
      ✓ should recover from corruption (156ms)
    Photo Operations
      ✓ should save a photo (23ms)
      ✓ should update existing photo (18ms)
      ✓ should save multiple photos (31ms)
      ✓ should delete a photo (15ms)
    Cache Operations
      ✓ should update photo cache info (19ms)
      ✓ should clear photo cache (14ms)
      ✓ should get photos to cache (11ms)
      ✓ should calculate cache size (13ms)
    Display Operations
      ✓ should get next photo to display (22ms)
      ✓ should mark photo as viewed (16ms)
      ✓ should return null when no cached photos (9ms)
    Settings Operations
      ✓ should save and retrieve settings (17ms)
      ✓ should update existing setting (15ms)
      ✓ should return null for non-existent setting (8ms)
    Eviction Operations
      ✓ should get oldest cached photos (21ms)
      ✓ should prioritize least recently viewed (19ms)

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
Time:        2.156s
```

#### Integration Tests

```
PASS  tests/integration/full-workflow.test.js
  Integration: Full Workflow
    ✓ Complete workflow: Add photos → Cache → Display (234ms)
    ✓ Cache eviction workflow (187ms)
    ✓ Incremental caching workflow (156ms)
    ✓ Display rotation workflow (198ms)
    ✓ Failure recovery workflow (145ms)
    ✓ Settings persistence workflow (112ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Time:        1.432s
```

---

## Writing New Tests

### Unit Test Template

```javascript
const YourComponent = require('../../components/YourComponent');

describe('YourComponent', () => {
  let component;

  beforeEach(() => {
    component = new YourComponent(/* config */);
  });

  afterEach(() => {
    // cleanup
  });

  test('should do something', () => {
    const result = component.doSomething();
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template

```javascript
describe('Integration: Feature X', () => {
  beforeAll(async () => {
    // Setup test environment
  });

  afterAll(async () => {
    // Cleanup
  });

  test('workflow test', async () => {
    // Test complete workflow
  });
});
```

---

## Continuous Integration

Tests can run in CI/CD pipelines:

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

### Exit Codes

- **0**: All tests passed ✅
- **1**: One or more tests failed ❌

---

## Test Coverage Goals

| Metric | Target | Current |
|--------|--------|---------|
| Statements | >70% | TBD |
| Branches | >70% | TBD |
| Functions | >70% | TBD |
| Lines | >70% | TBD |

Run `npm test -- --coverage` to generate report.

---

## Debugging Tests

### Run Single Test

```bash
npm test -- --testNamePattern="should save a photo"
```

### Verbose Output

```bash
npm test -- --verbose
```

### Debug with Node Inspector

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome.

---

## Performance Testing

### Benchmark Tests

Create `tests/performance/` for benchmarks:

```javascript
test('should scan 1000 photos in <5 seconds', async () => {
  const start = Date.now();

  // Test code

  const duration = Date.now() - start;
  expect(duration).toBeLessThan(5000);
});
```

---

## Common Issues

### "Cannot find module"

```bash
npm install
```

### "ENOENT: no such file or directory"

Tests auto-create temp directories. If issues persist:

```bash
rm -rf tests/temp
```

### "Timeout of 5000ms exceeded"

Some tests need more time:

```javascript
jest.setTimeout(30000); // 30 seconds
```

Or configure in `jest.config.js`:
```javascript
testTimeout: 30000
```

### Mock Data Not Working

Clear Jest cache:

```bash
npm test -- --clearCache
```

---

## Manual Testing Checklist

After passing automated tests, verify:

- [ ] Run `node test_v3_standalone.js` successfully
- [ ] All 12 standalone tests pass
- [ ] Photos download to cache/
- [ ] Database created at cache/photos.db
- [ ] No error messages in logs
- [ ] Cache statistics look correct

---

## Test Data

### Mock Photos

Tests use mock photo data:

```javascript
const mockPhoto = {
  id: 'test123',
  name: 'test.jpg',
  parents: ['folder123'],
  createdTime: '2024-01-01T00:00:00Z',
  imageMediaMetadata: {
    width: 1920,
    height: 1080
  }
};
```

### Real Photos

For standalone tests, use your own Drive folder with real photos.

---

## Best Practices

### ✅ Do

- Write tests for new features
- Keep tests isolated (no shared state)
- Use descriptive test names
- Mock external dependencies
- Clean up after tests
- Aim for >70% coverage

### ❌ Don't

- Test implementation details
- Share state between tests
- Make real API calls in unit tests
- Skip cleanup
- Commit temp files

---

## Test Maintenance

### Update Tests When

- Adding new features
- Fixing bugs
- Refactoring code
- Changing APIs

### Review Tests

- Monthly: Review and update
- Before release: Run full suite
- After changes: Verify affected tests

---

## Resources

- **Jest Docs**: https://jestjs.io/docs/getting-started
- **Test Examples**: See `tests/` directory
- **Coverage Report**: `coverage/lcov-report/index.html`
- **CI Setup**: `.github/workflows/test.yml` (if exists)

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run in watch mode
npm run test:watch

# Run standalone test (with real Drive API)
node test_v3_standalone.js

# Update snapshots (if using)
npm test -- -u

# Clear cache
npm test -- --clearCache
```

---

## Summary

✅ **Unit Tests**: Individual components (no external deps)
✅ **Integration Tests**: Components working together (mocked Drive API)
✅ **Standalone Tests**: Real Drive API calls
✅ **70%+ Coverage Target**
✅ **CI/CD Ready**
✅ **No MagicMirror Required**

**You can test everything locally before deploying!** 🧪

---

*For more details on standalone testing, see `TEST_INSTRUCTIONS.md`*
