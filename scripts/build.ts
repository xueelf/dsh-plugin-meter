import { $, build, file, Glob } from 'bun';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Journal, LevelDebug } from 'annal';
import { name } from '~/package.json';
import { compilerOptions } from '~/tsconfig.json';

const logger = new Journal({ scope: 'build', level: LevelDebug });
const outDir = compilerOptions.outDir;

await Bun.$`rm -rf ${outDir}`;
logger.info('Output directory cleaned');
await $`tsc -p tsconfig.build.json`;
logger.info('Type declaration files generated');
// 宿主入口运行在 Node 进程。
await build({
  entrypoints: ['src/index.ts'],
  format: 'esm',
  outdir: outDir,
  packages: 'external',
  target: 'node',
});
/**
 * Client 产物是 lazy CJS factory。
 * Bun 输出 CJS，React 系包保持 external，
 * 再把整个 bundle 包进 __ModuleLoader__.load 的 factory。
 */
await build({
  entrypoints: ['src/client.ts'],
  external: [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
    'react/jsx-runtime',
    'react-dom',
  ],
  format: 'cjs',
  outdir: outDir,
  target: 'browser',
  jsx: {
    runtime: 'automatic',
    development: false,
  },
  loader: {
    '.css': 'text',
  },
  define: {
    __PACKAGE_NAME__: JSON.stringify(name),
  },
});
logger.info('JavaScript bundles generated');

const clientPath = join(outDir, 'client.js');
const clientBundle = await file(clientPath).text();
const clientArtifact = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${clientBundle}
    return module.exports;
  },
});
`;

await writeFile(clientPath, clientArtifact);
new Bun.Transpiler({ loader: 'js' }).transformSync(clientArtifact);
logger.info('Client artifact syntax verified');

/**
 * 页面会原样执行 Client 产物，只要残留 `import` 或 `export` 语句，
 * 或者产物不是 factory 包裹的 CJS，插件在加载时就会失败。
 */
const moduleSyntax = clientArtifact
  .split('\n')
  .filter(line => /^\s*(?:import|export)\s/u.test(line));

if (moduleSyntax.length > 0) {
  throw new Error(
    `Client artifact must stay free of module syntax:\n${moduleSyntax.join('\n')}`,
  );
}

if (!clientArtifact.includes('__ModuleLoader__')) {
  throw new Error(
    'Client artifact does not register with the Web module loader',
  );
}
logger.info('Client artifact verified');

const outputPaths = await Array.fromAsync(
  new Glob('**/*').scan({
    absolute: true,
    cwd: outDir,
  }),
);
const outputBytes = outputPaths.reduce(
  (bytes, path) => bytes + file(path).size,
  0,
);
const outputSize = `${(outputBytes / 1000).toFixed(2)} KB`;

logger.info('Build completed');
logger.debug(`Output: ${outDir}`);
logger.debug(`Artifacts: ${outputPaths.length} files, ${outputSize}`);
