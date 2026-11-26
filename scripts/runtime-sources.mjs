import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/** Build-time closure, so adding a shared runtime contract cannot silently break the shipped API. */
export function copyRuntimeSources(root, output) {
  const server = join(root, 'server'), queue = readdirSync(server, { recursive: true }).filter(file => file.endsWith('.ts')).map(file => join(server, file));
  const seen = new Set(), shared = [];
  while (queue.length) {
    const file = queue.shift(); if (seen.has(file)) continue; seen.add(file);
    const local = relative(root, file);
    if (isAbsolute(local) || local.startsWith('..')) throw new Error('Runtime source escaped workspace');
    if (local.startsWith('src')) {
      if (!file.endsWith('.ts')) throw new Error(`UI file reached the API runtime: ${local}`);
      const destination = join(output, local); mkdirSync(dirname(destination), { recursive: true }); cpSync(file, destination); shared.push(local);
    }
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (node.isTypeOnly || node.importClause?.isTypeOnly || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const clause = node.importClause;
      if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(element => element.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text; if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      const found = [target, `${target}.ts`, join(target,'index.ts')].find(candidate => existsSync(candidate) && candidate.endsWith('.ts'));
      if (!found) throw new Error(`Missing local runtime source: ${local} -> ${specifier}`);
      queue.push(found);
    }
  }
  return shared;
}
