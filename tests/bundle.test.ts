import { expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dsh, files, name, exports as packageExports } from '~/package.json';

const root = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** locale 是否带有插件面板所需的标题与描述。 */
function isDisplayText(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('meta' in value)) {
    return false;
  }
  const meta = value.meta;

  if (typeof meta !== 'object' || meta === null) {
    return false;
  }
  return (
    'title' in meta &&
    typeof meta.title === 'string' &&
    meta.title !== '' &&
    'description' in meta &&
    typeof meta.description === 'string' &&
    meta.description !== ''
  );
}

/** bundle 运行时直接使用、不经过构建的源文件。 */
const SOURCE_ARTIFACTS = [
  'cordis.patch.yml',
  'icon.svg',
  'locale/en.json',
  'locale/zh.json',
];

test('bundle 补丁声明', () => {
  const patch = read(dsh.bundle.patch);

  expect(patch).toContain(`name: ${name}`);
});
test('源文件清单', () => {
  for (const path of SOURCE_ARTIFACTS) {
    expect(statSync(join(root, path)).isFile()).toBe(true);
  }
});
test('发布文件清单', () => {
  for (const entry of [
    'dist',
    'cordis.patch.yml',
    'locale/*.json',
    'icon.svg',
  ]) {
    expect(files).toContain(entry);
  }
});
test('运行时入口与展示资源', () => {
  expect(packageExports['.']).toBeDefined();
  expect(packageExports['./client']).toBeDefined();
  expect(packageExports['./icon']).toBe('./icon.svg');
  expect(dsh.client.platform).toBe('web');
});
test('图标画布', () => {
  const icon = read('icon.svg');

  expect(icon).toContain('width="36"');
  expect(icon).toContain('height="36"');
  expect(icon).toContain('viewBox="0 0 36 36"');
  expect(statSync(join(root, 'icon.svg')).size).toBeLessThan(256 * 1024);
});
test('locale 展示文案', () => {
  for (const locale of ['en', 'zh']) {
    const parsed: unknown = JSON.parse(read(`locale/${locale}.json`));

    expect(isDisplayText(parsed)).toBe(true);
  }
});
