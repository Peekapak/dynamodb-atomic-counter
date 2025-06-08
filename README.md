# dynamodb-atomic-counter

This library provides atomic counters using Amazon DynamoDB. Each increment request
increments a counter value that is stored in a DynamoDB table (named "AtomicCounters" by default).
Multiple increment requests can be sent simultaneously but each request will receive a
unique value, therefore this library can be used to generate auto-increment ids.

**Updated for AWS SDK v3 and TypeScript support!**

## Installation

Execute the following command at the root of your project:

```bash
npm install dynamodb-atomic-counter
```

## Breaking Changes from v0.x

- **AWS SDK v3**: Now uses `@aws-sdk/client-dynamodb` instead of `aws-sdk`
- **TypeScript**: Full TypeScript support with type definitions
- **Client Configuration**: Use `setClient()` to configure DynamoDB client instead of `config`
- **Dependencies**: Removed `underscore` and `underscore.deferred` dependencies

## Configuration

### AWS SDK v3 Client Configuration

Instead of using the `config` object, you now configure the DynamoDB client and pass it to the library:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import * as atomicCounter from "dynamodb-atomic-counter";

// Create and configure the DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1",
  // Add other configuration options as needed
});

// Set the client for the atomic counter library
atomicCounter.setClient(client);
```

You can also pass a client instance directly to each operation:

```typescript
atomicCounter.increment("Users", { client: myCustomClient });
```

## API Reference

### `increment(counterId, options)`

This method increments the counter for the specified `counterId`.
It returns a promise-like object with jQuery-style `done`, `fail`, and `always` methods.

**Parameters:**

- `counterId` (string): The unique name/identifier of the counter.
- `options` (optional): An options object to customize the operation.

**Options:**

- `tableName` (string): DynamoDB table name. Default: "AtomicCounters"
- `keyAttribute` (string): Counter identifier attribute name. Default: "id"
- `countAttribute` (string): Count value attribute name. Default: "lastValue"
- `increment` (number): Increment amount. Default: 1
- `success` (function): Success callback receiving the new counter value
- `error` (function): Error callback receiving the error object
- `complete` (function): Completion callback receiving value or error
- `context` (any): Context object for callbacks (`this` value)
- `client` (DynamoDBClient): Custom DynamoDB client instance
- `dynamodb` (object): Additional DynamoDB parameters

### `getLastValue(counterId, options)`

This method retrieves the last generated value for the specified `counterId`.
If the counter doesn't exist, it returns 0.

**Parameters:**

- `counterId` (string): The unique name/identifier of the counter.
- `options` (optional): Same options as `increment` method.

### `setClient(client)`

Sets a global DynamoDB client instance for all operations.

**Parameters:**

- `client` (DynamoDBClient): AWS SDK v3 DynamoDB client instance

### `getClient()`

Returns the current DynamoDB client instance.

## Basic Usage

```typescript
import * as atomicCounter from "dynamodb-atomic-counter";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Configure AWS SDK v3 client
const client = new DynamoDBClient({ region: "us-east-1" });
atomicCounter.setClient(client);

/**
 * Increment the "Users" counter. Make sure there's a table named
 * "AtomicCounters", with "id" (string) as the primary hash key,
 * in your AWS account.
 */
atomicCounter
  .increment("Users")
  .done((value) => {
    // `value` is the new incremented value.
    console.log("New counter value:", value);
  })
  .fail((error) => {
    // An error occurred
    console.error("Error:", error);
  })
  .always((valueOrError) => {
    // Executed whether or not the increment operation was successful
    console.log("Operation completed");
  });

/**
 * Retrieve the last value generated for the "Clients" counter.
 */
atomicCounter
  .getLastValue("Clients")
  .done((lastValue) => {
    // `lastValue` is the last value generated for the "Clients" counter.
    // If a value has not been generated before, `lastValue` would be 0.
    console.log("Last value:", lastValue);
  })
  .fail((error) => {
    // An error occurred
    console.error("Error:", error);
  })
  .always((valueOrError) => {
    // Executed whether or not the request was successful
    console.log("Operation completed");
  });
```

## Advanced Usage

### Custom Table and Attributes

```typescript
atomicCounter
  .increment("OrderNumbers", {
    tableName: "MyCounters",
    keyAttribute: "counterName",
    countAttribute: "currentValue",
    increment: 5,
  })
  .done((value) => {
    console.log("Order number:", value);
  });
```

### Using with Async/Await

```typescript
// Helper function to convert to native Promise
function toPromise<T>(atomicPromise: any): Promise<T> {
  return new Promise((resolve, reject) => {
    atomicPromise.done(resolve).fail(reject);
  });
}

// Usage with async/await
async function generateUserId(): Promise<number> {
  try {
    const userId = await toPromise<number>(atomicCounter.increment("Users"));
    return userId;
  } catch (error) {
    console.error("Failed to generate user ID:", error);
    throw error;
  }
}
```

### Concurrent Operations

The library handles concurrent increment operations safely, ensuring each request receives a unique value:

```typescript
// Multiple concurrent increments
const promises = Array.from(
  { length: 10 },
  (_, i) =>
    new Promise<number>((resolve, reject) => {
      atomicCounter.increment("Clients").done(resolve).fail(reject);
    }),
);

Promise.all(promises).then((values) => {
  console.log("All unique values:", values);
  // Each value in the array will be unique
});
```

## TypeScript Support

The library is fully typed and provides excellent TypeScript support:

```typescript
import {
  increment,
  getLastValue,
  AtomicCounterOptions,
} from "dynamodb-atomic-counter";

const options: AtomicCounterOptions = {
  tableName: "MyCounters",
  increment: 10,
  success: (value: number) => console.log("Success:", value),
  error: (error: any) => console.error("Error:", error),
};

increment("MyCounter", options);
```

## Migration from v0.x

1. **Install new dependencies:**

   ```bash
   npm uninstall aws-sdk underscore underscore.deferred
   npm install @aws-sdk/client-dynamodb
   ```

2. **Update imports:**

   ```typescript
   // Old v0.x
   const atomicCounter = require("dynamodb-atomic-counter");

   // New v1.x
   import * as atomicCounter from "dynamodb-atomic-counter";
   ```

3. **Update configuration:**

   ```typescript
   // Old v0.x
   atomicCounter.config.update({ region: "us-east-1" });

   // New v1.x
   import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
   const client = new DynamoDBClient({ region: "us-east-1" });
   atomicCounter.setClient(client);
   ```

4. **API remains the same:** The `increment` and `getLastValue` methods work exactly the same way, maintaining backward compatibility for the promise-like interface.

## Requirements

- Node.js 14+
- AWS SDK v3
- DynamoDB table with string primary key

Make sure to create your DynamoDB table with the appropriate primary key attribute (default: "id" of type String).
