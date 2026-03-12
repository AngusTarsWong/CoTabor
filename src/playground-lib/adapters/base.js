import { findAllMidsceneLocatorField } from '@/core/ai-model';
export class BasePlaygroundAdapter {
    // Optional method for getting action space - default implementation returns empty array
    async getActionSpace(_context) {
        return [];
    }
    // Common validation logic - can be overridden if needed
    validateParams(value, action) {
        if (!action?.paramSchema) {
            return { valid: true };
        }
        const needsStructuredParams = this.actionNeedsStructuredParams(action);
        if (!needsStructuredParams) {
            return { valid: true };
        }
        if (!value.params) {
            return { valid: false, errorMessage: 'Parameters are required' };
        }
        try {
            const paramsForValidation = this.prepareParamsForValidation(value.params, action);
            action.paramSchema.parse(paramsForValidation);
            return { valid: true };
        }
        catch (error) {
            return this.handleValidationError(error);
        }
    }
    // Common display content creation logic - can be overridden if needed
    createDisplayContent(value, needsStructuredParams, action) {
        if (!needsStructuredParams || !value.params || !action?.paramSchema) {
            return value.prompt || '';
        }
        const paramsList = this.buildParamsDisplayList(value.params, action);
        return paramsList.join('\n') || value.prompt || '';
    }
    // Helper method for basic error message formatting
    formatBasicErrorMessage(error) {
        return error?.message || 'Unknown error';
    }
    // Helper method for parsing structured params base logic
    getSchemaKeys(action) {
        if (!action?.paramSchema || !('shape' in action.paramSchema)) {
            return [];
        }
        const schema = action.paramSchema;
        return schema && 'shape' in schema
            ? Object.keys(schema.shape)
            : [];
    }
    // Helper method for filtering valid params
    filterValidParams(params, excludeKeys = []) {
        const filtered = {};
        Object.keys(params).forEach((key) => {
            if (!excludeKeys.includes(key) &&
                params[key] !== undefined &&
                params[key] !== null &&
                params[key] !== '') {
                filtered[key] = params[key];
            }
        });
        return filtered;
    }
    // Check if action needs structured parameters
    actionNeedsStructuredParams(action) {
        if (typeof action.paramSchema === 'object' &&
            'shape' in action.paramSchema) {
            const shape = action.paramSchema.shape || {};
            return Object.keys(shape).length > 0;
        }
        return true; // If paramSchema exists but not in expected format, assume it needs params
    }
    // Prepare parameters for validation by converting string locate fields
    prepareParamsForValidation(params, action) {
        const paramsForValidation = { ...params };
        if (action.paramSchema) {
            const locatorFieldKeys = findAllMidsceneLocatorField(action.paramSchema);
            locatorFieldKeys.forEach((key) => {
                if (typeof paramsForValidation[key] === 'string') {
                    paramsForValidation[key] = {
                        midscene_location_field_flag: true,
                        prompt: paramsForValidation[key],
                        center: [0, 0], // dummy values for validation
                        rect: { left: 0, top: 0, width: 0, height: 0 },
                    };
                }
            });
        }
        return paramsForValidation;
    }
    // Handle validation errors with proper error message extraction
    handleValidationError(error) {
        const zodError = error;
        if (zodError.errors && zodError.errors.length > 0) {
            const errorMessages = zodError.errors
                .filter((err) => {
                const path = err.path.join('.');
                return (!path.includes('center') &&
                    !path.includes('rect') &&
                    !path.includes('midscene_location_field_flag'));
            })
                .map((err) => {
                const field = err.path.join('.');
                return `${field}: ${err.message}`;
            });
            if (errorMessages.length > 0) {
                return {
                    valid: false,
                    errorMessage: `Validation error: ${errorMessages.join(', ')}`,
                };
            }
        }
        const errorMsg = error instanceof Error ? error.message : 'Unknown validation error';
        return {
            valid: false,
            errorMessage: `Parameter validation failed: ${errorMsg}`,
        };
    }
    // Build display list for parameters
    buildParamsDisplayList(params, action) {
        const paramsList = [];
        const schema = action.paramSchema;
        if (!(schema && 'shape' in schema)) {
            return paramsList;
        }
        const locatorFieldKeys = findAllMidsceneLocatorField(schema);
        const shapeKeys = Object.keys(schema.shape);
        shapeKeys.forEach((key) => {
            const paramValue = params[key];
            if (this.isValidParamValue(paramValue)) {
                const displayKey = this.capitalizeFirstLetter(key);
                const formattedValue = this.formatParamValue(key, paramValue, locatorFieldKeys.includes(key));
                paramsList.push(`${displayKey}: ${formattedValue}`);
            }
        });
        return paramsList;
    }
    // Check if parameter value is valid for display
    isValidParamValue(value) {
        return value !== undefined && value !== null && value !== '';
    }
    // Capitalize first letter of a string
    capitalizeFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    // Format parameter value for display
    formatParamValue(key, value, isLocateField) {
        if (isLocateField || typeof value === 'string') {
            return `"${value}"`;
        }
        if (typeof value === 'number') {
            // Special handling for distance in scroll
            return key === 'distance' ? `${value}px` : `${value}`;
        }
        return `${value}`;
    }
}
