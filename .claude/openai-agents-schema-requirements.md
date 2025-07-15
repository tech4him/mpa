# OpenAI Agents Schema Requirements - CRITICAL MEMORY

## Key Insight: OpenAI's Schema Validation is STRICTER than Standard JSON Schema

**CRITICAL RULE**: OpenAI's schema validation requires ALL properties to be in the `required` array, even if they have default values. This is a stricter interpretation than typical JSON Schema.

## What This Means

- If a parameter has a `default` value, it MUST still be included in the `required` array
- You cannot have optional parameters with defaults outside the required array
- This applies to ALL OpenAI Agents tool definitions

## Correct Pattern

```typescript
// CORRECT ✅
export const myTool = tool({
  name: 'myTool',
  parameters: {
    type: 'object',
    properties: {
      requiredParam: {
        type: 'string',
        description: 'Required parameter'
      },
      optionalWithDefault: {
        type: 'string',
        description: 'Optional with default',
        default: 'defaultValue'
      }
    },
    required: ['requiredParam', 'optionalWithDefault'], // BOTH must be here
    additionalProperties: false
  }
}, async ({ requiredParam, optionalWithDefault = 'defaultValue' }) => {
  // Handle defaults in the function signature
  return await implementation({ requiredParam, optionalWithDefault })
})
```

## Wrong Pattern

```typescript
// WRONG ❌
export const myTool = tool({
  name: 'myTool',
  parameters: {
    type: 'object',
    properties: {
      requiredParam: {
        type: 'string',
        description: 'Required parameter'
      },
      optionalWithDefault: {
        type: 'string',
        description: 'Optional with default',
        default: 'defaultValue'
      }
    },
    required: ['requiredParam'], // Missing optionalWithDefault
    additionalProperties: false
  }
}, implementation)
```

## Error Message to Watch For

```
Error: 400 Invalid schema for function 'toolName': In context=(), 
'required' is required to be supplied and to be an array including 
every key in properties. Missing 'parameterName'.
```

## Historical Fixes Applied

1. `searchRelationshipHistory` - Added `timeframe` to required array
2. `verifyOrganizationalFacts` - Added `context` to required array  
3. `getEmailThreadContext` - Added `includeHistory` to required array
4. `updateOrganizationalMemory` - Added `source`, `priority`, `significance` to required array

## Always Remember

- **All properties with defaults must be in required array**
- **Handle defaults in function signature, not schema**
- **OpenAI is stricter than standard JSON Schema validators**

Date: 2025-07-13
Context: MPA Email Agent project - learned this after multiple attempts at fixing tool schema validation errors.