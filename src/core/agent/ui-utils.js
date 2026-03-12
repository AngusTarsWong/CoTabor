export function typeStr(task) {
    // // For Action tasks with subType, show "Action Space / subType"
    // if (task.type === 'Action' && task.subType) {
    //   return `Action Space / ${task.subType}`;
    // }
    // // For all other cases with subType, show "type / subType"
    // if (task.subType) {
    //   return `${task.type} / ${task.subType}`;
    // }
    // No subType, just show type
    return task.subType || task.type;
}
export function locateParamStr(locate) {
    if (!locate) {
        return '';
    }
    if (typeof locate === 'string') {
        return locate;
    }
    if (typeof locate === 'object') {
        // Check for nested prompt.prompt (Planning Locate tasks)
        if (typeof locate.prompt === 'object' &&
            locate.prompt !== null &&
            locate.prompt.prompt) {
            const prompt = locate.prompt.prompt;
            return prompt;
        }
        // Check for direct prompt string
        if (typeof locate.prompt === 'string') {
            return locate.prompt;
        }
        // Check for description field (Action Space tasks like Tap, Hover)
        if (typeof locate.description === 'string') {
            return locate.description;
        }
    }
    return '';
}
export function scrollParamStr(scrollParam) {
    if (!scrollParam) {
        return '';
    }
    return `${scrollParam.direction || 'down'}, ${scrollParam.scrollType || 'singleAction'}, ${scrollParam.distance || 'distance-not-set'}`;
}
export function pullParamStr(pullParam) {
    if (!pullParam) {
        return '';
    }
    const parts = [];
    parts.push(`direction: ${pullParam.direction || 'down'}`);
    if (pullParam.distance) {
        parts.push(`distance: ${pullParam.distance}`);
    }
    if (pullParam.duration) {
        parts.push(`duration: ${pullParam.duration}ms`);
    }
    return parts.join(', ');
}
export function extractInsightParam(taskParam) {
    if (!taskParam) {
        return { content: '' };
    }
    // Helper to extract images from multimodalPrompt
    const extractImages = (source) => {
        return source?.multimodalPrompt?.images &&
            Array.isArray(source.multimodalPrompt.images)
            ? source.multimodalPrompt.images
            : undefined;
    };
    // Helper to stringify if needed
    const toContent = (value) => typeof value === 'string' ? value : JSON.stringify(value);
    // Extract from demand
    if (taskParam.demand) {
        return {
            content: toContent(taskParam.demand),
            images: extractImages(taskParam),
        };
    }
    // Extract from assertion
    if (taskParam.assertion) {
        return {
            content: toContent(taskParam.assertion),
            images: extractImages(taskParam),
        };
    }
    // Extract from dataDemand
    if (taskParam.dataDemand) {
        const { dataDemand } = taskParam;
        if (typeof dataDemand === 'string') {
            return { content: dataDemand };
        }
        if (typeof dataDemand === 'object') {
            return {
                content: toContent(dataDemand.demand || dataDemand),
                images: extractImages(dataDemand),
            };
        }
    }
    return { content: '' };
}
export function taskTitleStr(type, prompt) {
    if (prompt) {
        return `${type} - ${prompt}`;
    }
    return type;
}
export function paramStr(task) {
    let value;
    if (task.type === 'Planning') {
        if (task.subType === 'Locate') {
            value = locateParamStr(task?.param);
        }
        else {
            // Prefer AI-generated output.log over user input
            const planTask = task;
            value = planTask.output?.log || planTask.param?.userInstruction;
        }
    }
    if (task.type === 'Insight') {
        value = extractInsightParam(task?.param).content;
    }
    if (task.type === 'Action Space') {
        const locate = task?.param?.locate;
        const locateStr = locate ? locateParamStr(locate) : '';
        value = task.thought || '';
        if (typeof task?.param?.timeMs === 'number') {
            value = `${task?.param?.timeMs}ms`;
        }
        else if (typeof task?.param?.scrollType === 'string') {
            value = scrollParamStr(task?.param);
        }
        else if (typeof task?.param?.direction === 'string' &&
            task?.subType === 'PullGesture') {
            value = pullParamStr(task?.param);
        }
        else if (typeof task?.param?.value !== 'undefined') {
            value = task?.param?.value;
        }
        else if (task?.param &&
            typeof task?.param === 'object' &&
            Object.keys(task?.param || {}).length > 0) {
            // General parameter handling for actions with custom parameters
            // (e.g., runWdaRequest, runAdbShell)
            value = task?.param;
        }
        if (locateStr) {
            if (value && typeof value !== 'object') {
                value = `${locateStr} - ${value}`;
            }
            else {
                value = locateStr;
            }
        }
    }
    if (typeof value === 'undefined')
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object') {
        const locateStr = locateParamStr(value);
        if (locateStr) {
            return locateStr;
        }
        return JSON.stringify(value, undefined, 2);
    }
    return String(value);
}
