// JSON <-> YAML.
import yaml from 'js-yaml';

export function jsonToYaml(json: string, indent = 2): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  return yaml.dump(data, { indent, lineWidth: -1, noRefs: true });
}

export function yamlToJson(src: string, indent = 2): string {
  const docs = yaml.loadAll(src);
  const data = docs.length === 1 ? docs[0] : docs;
  return JSON.stringify(data ?? null, null, indent);
}
