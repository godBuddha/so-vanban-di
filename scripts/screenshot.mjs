// Chụp ảnh toàn bộ màn hình Sổ Văn Bản Đi — dùng Chrome hệ thống + playwright-core
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = '/home/jewking/.config/CherryStudio/Data/Agents/system/2026-09-13/df40b64d-b25b-4f45-8000-23188dec787c/so-vanban-di/docs/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--lang=vi'],
});

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'vi-VN' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function login(page) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input:not([type="password"])', 'admin');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.keyboard.press('Enter');
  await page.waitForURL(BASE + '/', { timeout: 15000 });
  await page.waitForTimeout(1500); // chờ dữ liệu bảng
}

const results = [];

// ===== 1. Trang đăng nhập (desktop) =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: OUT + '/01-dang-nhap.png' });
  results.push('01-dang-nhap');
  await ctx.close();
}

// ===== 2-4. Sổ văn bản đi: bảng, chi tiết, form nhập =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await login(page);
  await page.screenshot({ path: OUT + '/02-so-van-ban-di.png' });
  results.push('02-so-van-ban-di');

  // 2b. Lọc đang áp dụng (tìm kiếm)
  await page.fill('input[placeholder*="Tìm"], input[type="search"], input[placeholder*="tìm"]', 'họp').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/02b-so-tim-kiem.png' });
  results.push('02b-so-tim-kiem');
  await page.fill('input[placeholder*="Tìm"], input[type="search"], input[placeholder*="tìm"]', '').catch(() => {});
  await page.waitForTimeout(800);

  // 3. Chi tiết văn bản (bấm dòng đầu)
  const row = page.locator('tbody tr').first();
  await row.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/03-chi-tiet-van-ban.png' });
  results.push('03-chi-tiet-van-ban');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // 4. Form nhập văn bản mới
  await page.getByText('Nhập văn bản', { exact: false }).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/04-form-nhap-van-ban.png' });
  results.push('04-form-nhap-van-ban');
  await page.keyboard.press('Escape');
  await ctx.close();
}

// ===== 5. In sổ (không đăng nhập menu vẫn cần auth) =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/in-so', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/05-in-so.png', fullPage: false });
  results.push('05-in-so');
  await ctx.close();
}

// ===== 6. Nhập Excel =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/nhap-excel', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + '/06-nhap-excel.png' });
  results.push('06-nhap-excel');
  await ctx.close();
}

// ===== 7. Quản trị người dùng =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/07-quan-tri-nguoi-dung.png' });
  results.push('07-quan-tri-nguoi-dung');
  await ctx.close();
}

// ===== 8. Nhật ký =====
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/admin/audit', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/08-nhat-ky.png' });
  results.push('08-nhat-ky');
  await ctx.close();
}

// ===== 9. Giao diện điện thoại (sổ + drawer menu) =====
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  await login(page);
  await page.screenshot({ path: OUT + '/09-mobile-so-van-ban.png' });
  results.push('09-mobile-so-van-ban');
  // mở drawer
  const burger = page.locator('button').filter({ hasText: /☰|menu/i }).first();
  if (await burger.count()) {
    await burger.click();
    await page.waitForTimeout(600);
  } else {
    await page.locator('header button').first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: OUT + '/09b-mobile-menu.png' });
  results.push('09b-mobile-menu');
  await ctx.close();
}

await browser.close();
console.log('Đã chụp:\n' + results.map((r) => ' - ' + r).join('\n'));
