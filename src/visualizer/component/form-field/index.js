import { jsx as _jsx } from "react/jsx-runtime";
import { Form, Input, InputNumber, Select } from 'antd';
const { TextArea } = Input;
const renderLabel = (label, isOptional) => {
    return `${label}${isOptional ? ' (Optional)' : ''}`;
};
export const TextField = ({ name, label, isRequired, marginBottom, placeholder: customPlaceholder, }) => {
    const placeholder = customPlaceholder || `Enter ${name}`;
    return (_jsx(Form.Item, { name: ['params', name], label: renderLabel(label, !isRequired), rules: isRequired ? [{ required: true, message: `Please input ${name}` }] : [], style: { marginBottom }, colon: false, children: _jsx(Input, { placeholder: placeholder }) }, name));
};
export const LocateField = ({ name, label, isRequired, marginBottom, placeholder: customPlaceholder, }) => {
    const placeholder = customPlaceholder || `Describe the ${name}, use natural language`;
    return (_jsx(Form.Item, { name: ['params', name], label: renderLabel(label, !isRequired), rules: isRequired
            ? [
                {
                    required: true,
                    message: `The ${name} is required`,
                },
            ]
            : [], style: { marginBottom }, colon: false, children: _jsx(TextArea, { rows: 2, placeholder: placeholder }) }, name));
};
export const EnumField = ({ name, label, fieldSchema, isRequired, marginBottom, placeholder: customPlaceholder, }) => {
    const enumValues = fieldSchema._def?.values || [];
    const selectOptions = enumValues.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
    }));
    return (_jsx(Form.Item, { name: ['params', name], label: label, rules: isRequired ? [{ required: true, message: `Please select ${name}` }] : [], style: { marginBottom }, colon: false, children: _jsx(Select, { placeholder: customPlaceholder || `Select ${name}`, options: selectOptions }) }, name));
};
export const NumberField = ({ name, label, isRequired, marginBottom, placeholder: customPlaceholder, }) => {
    const defaultPlaceholder = name === 'distance' ? 500 : 0;
    const placeholderValue = customPlaceholder
        ? Number(customPlaceholder) || defaultPlaceholder
        : defaultPlaceholder;
    const min = 0;
    const max = name === 'distance' ? 10000 : undefined;
    return (_jsx(Form.Item, { name: ['params', name], label: `${label}${name === 'distance' ? ' (px)' : ''}`, rules: isRequired
            ? [
                { required: true, message: `Please input ${name}` },
                {
                    type: 'number',
                    min,
                    message: `${label} must be at least ${min}`,
                },
            ]
            : [
                {
                    type: 'number',
                    min,
                    message: `${label} must be at least ${min}`,
                },
            ], style: {
            flex: name === 'distance' ? 1 : undefined,
            marginBottom,
        }, colon: false, children: _jsx(InputNumber, { placeholder: placeholderValue.toString(), min: min, max: max, step: name === 'distance' ? 10 : 1, style: { width: '100%' } }) }, name));
};
export const BooleanField = ({ name, label, isRequired, marginBottom, placeholder: customPlaceholder, }) => {
    const selectOptions = [
        { value: true, label: 'True' },
        { value: false, label: 'False' },
    ];
    return (_jsx(Form.Item, { name: ['params', name], label: renderLabel(label, !isRequired), rules: isRequired ? [{ required: true, message: `Please select ${name}` }] : [], style: { marginBottom }, colon: false, children: _jsx(Select, { placeholder: customPlaceholder || `Select ${name}`, options: selectOptions }) }, name));
};
