import yaml from 'js-yaml';
export function buildYaml(env, tasks) {
    const result = {
        target: env,
        tasks,
    };
    return yaml.dump(result, {
        indent: 2,
    });
}
