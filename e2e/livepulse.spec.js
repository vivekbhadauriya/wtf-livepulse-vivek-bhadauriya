import { test, expect } from '@playwright/test';

test.describe('WTF LivePulse E2E', () => {
  // Test 1: Verify the dashboard loads and displays gym cards
  test('Dashboard loads properly with gyms', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Check title and header
    await expect(page).toHaveTitle(/WTF LivePulse/);
    await expect(page.locator('h1')).toContainText('LivePulse');
    
    // Verify WebSocket status connects (can take a second)
    await expect(page.locator('.ws-status')).toContainText('Live', { timeout: 10000 });
    
    // Check that we have gym cards loaded
    await expect(page.locator('.gym-card')).toHaveCount(10);
  });

  // Test 2: Verify navigation to Analytics and content renders
  test('Navigation to Analytics tab works', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Click on Analytics tab
    await page.click('button#tab-analytics');
    
    // Verify heatmap view is selected by default
    await expect(page.locator('.card-title').first()).toContainText('Peak Hours Heatmap');
    
    // Switch to Revenue view
    await page.click('button#analytics-tab-revenue');
    await expect(page.locator('.card-title').first()).toContainText('Revenue by Plan');
  });

  // Test 3: Verify Simulator panel interactions
  test('Simulator panel displays controls and can start', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Click on Simulator tab
    await page.click('button#tab-simulator');
    
    // Verify controls are present
    const startBtn = page.locator('button:has-text("Start Simulation")');
    await expect(startBtn).toBeVisible();
    
    // We won't actually click start in the E2E to avoid mutating data unless isolated, 
    // but we can check if it exists and speed controls are present.
    await expect(page.locator('button:has-text("5x Speed")')).toBeVisible();
  });
});
