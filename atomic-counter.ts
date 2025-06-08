/**
 * dynamodb-atomic-counter - (c) 2015 Sergio Alcantara
 * Generates unique identifiers using DynamoDB atomic counter update operations.
 * 
 * Updated for AWS SDK v3 and TypeScript
 * @author Sergio Alcantara
 */

import {
	DynamoDBClient,
	UpdateItemCommand,
	GetItemCommand,
	UpdateItemCommandInput,
	GetItemCommandInput,
	AttributeValue
} from '@aws-sdk/client-dynamodb';

/**
 * Default name of the DynamoDB table where the atomic counters will be stored.
 */
const DEFAULT_TABLE_NAME = 'AtomicCounters';

/**
 * Default attribute name that will identify each counter.
 */
const DEFAULT_KEY_ATTRIBUTE = 'id';

/**
 * Default attribute name of the count value attribute.
 * The count attribute indicates the "last value" used in the last increment operation.
 */
const DEFAULT_COUNT_ATTRIBUTE = 'lastValue';

/**
 * Default increment value.
 */
const DEFAULT_INCREMENT = 1;

// Global DynamoDB client instance
let dynamoClient: DynamoDBClient | null = null;

/**
 * Options for increment and getLastValue operations
 */
export interface AtomicCounterOptions {
	tableName?: string;
	keyAttribute?: string;
	countAttribute?: string;
	increment?: number;
	success?: (value: number) => void;
	error?: (error: any) => void;
	complete?: (valueOrError: number | any) => void;
	context?: any;
	dynamodb?: Partial<UpdateItemCommandInput | GetItemCommandInput>;
	client?: DynamoDBClient;
}

/**
 * Promise-like interface for compatibility with original API
 */
export interface AtomicCounterPromise {
	done(callback: (value: number) => void): AtomicCounterPromise;
	fail(callback: (error: any) => void): AtomicCounterPromise;
	always(callback: (valueOrError: number | any) => void): AtomicCounterPromise;
}

/**
 * Internal promise implementation
 */
class AtomicCounterPromiseImpl implements AtomicCounterPromise {
	private doneCallbacks: Array<(value: number) => void> = [];
	private failCallbacks: Array<(error: any) => void> = [];
	private alwaysCallbacks: Array<(valueOrError: number | any) => void> = [];
	private resolved = false;
	private rejected = false;
	private value: number | any;

	constructor(private promise: Promise<number>) {
		this.promise
			.then((value) => {
				this.resolved = true;
				this.value = value;
				this.doneCallbacks.forEach(cb => cb(value));
				this.alwaysCallbacks.forEach(cb => cb(value));
			})
			.catch((error) => {
				this.rejected = true;
				this.value = error;
				this.failCallbacks.forEach(cb => cb(error));
				this.alwaysCallbacks.forEach(cb => cb(error));
			});
	}

	done(callback: (value: number) => void): AtomicCounterPromise {
		if (this.resolved) {
			callback(this.value);
		} else if (!this.rejected) {
			this.doneCallbacks.push(callback);
		}
		return this;
	}

	fail(callback: (error: any) => void): AtomicCounterPromise {
		if (this.rejected) {
			callback(this.value);
		} else if (!this.resolved) {
			this.failCallbacks.push(callback);
		}
		return this;
	}

	always(callback: (valueOrError: number | any) => void): AtomicCounterPromise {
		if (this.resolved || this.rejected) {
			callback(this.value);
		} else {
			this.alwaysCallbacks.push(callback);
		}
		return this;
	}
}

/**
 * Get or create DynamoDB client
 */
function getDynamoClient(clientOverride?: DynamoDBClient): DynamoDBClient {
	if (clientOverride) {
		return clientOverride;
	}

	if (!dynamoClient) {
		dynamoClient = new DynamoDBClient({});
	}

	return dynamoClient;
}

/**
 * Execute callbacks with optional context
 */
function executeCallback(
	callback: Function | undefined,
	context: any | undefined,
	args: any[]
): void {
	if (callback && typeof callback === 'function') {
		if (context) {
			callback.apply(context, args);
		} else {
			callback(...args);
		}
	}
}

/**
 * Increments the counter for the specified `counterId`.
 * It returns a promise-like object with jQuery-style done/fail/always methods.
 *
 * @param counterId The name or identifier of the counter to increment.
 * @param options An options object to overwrite some of the default behaviour of the increment operation.
 * @returns A promise-like object with done/fail/always methods
 */
export function increment(counterId: string, options: AtomicCounterOptions = {}): AtomicCounterPromise {
	const client = getDynamoClient(options.client);
	const keyAttribute = options.keyAttribute || DEFAULT_KEY_ATTRIBUTE;
	const countAttribute = options.countAttribute || DEFAULT_COUNT_ATTRIBUTE;
	const incrementValue = options.increment || DEFAULT_INCREMENT;

	const params: UpdateItemCommandInput = {
		TableName: options.tableName || DEFAULT_TABLE_NAME,
		Key: {
			[keyAttribute]: { S: counterId }
		},
		UpdateExpression: `ADD ${countAttribute} :increment`,
		ExpressionAttributeValues: {
			':increment': { N: incrementValue.toString() }
		},
		ReturnValues: 'UPDATED_NEW',
		...options.dynamodb
	};

	const promise = new Promise<number>((resolve, reject) => {
		const command = new UpdateItemCommand(params);

		client.send(command)
			.then((data) => {
				try {
					if (!data.Attributes || !data.Attributes[countAttribute]) {
						throw new Error('No count attribute returned from DynamoDB');
					}

					const countValue = data.Attributes[countAttribute];
					if (!countValue.N) {
						throw new Error('Count attribute is not a number');
					}

					const newCountValue = parseInt(countValue.N, 10);

					if (isNaN(newCountValue)) {
						throw new Error(`Could not parse incremented value (${countValue.N})`);
					}

					executeCallback(options.success, options.context, [newCountValue]);
					executeCallback(options.complete, options.context, [newCountValue]);

					resolve(newCountValue);
				} catch (error) {
					executeCallback(options.error, options.context, [error]);
					executeCallback(options.complete, options.context, [error]);
					reject(error);
				}
			})
			.catch((error) => {
				executeCallback(options.error, options.context, [error]);
				executeCallback(options.complete, options.context, [error]);
				reject(error);
			});
	});

	return new AtomicCounterPromiseImpl(promise);
}

/**
 * Gets the last value previously generated for the specified `counterId`.
 * It returns a promise-like object with jQuery-style done/fail/always methods.
 *
 * @param counterId The name or identifier of the counter.
 * @param options An options object to overwrite some of the default options.
 * @returns A promise-like object with done/fail/always methods
 */
export function getLastValue(counterId: string, options: AtomicCounterOptions = {}): AtomicCounterPromise {
	const client = getDynamoClient(options.client);
	const keyAttribute = options.keyAttribute || DEFAULT_KEY_ATTRIBUTE;
	const countAttribute = options.countAttribute || DEFAULT_COUNT_ATTRIBUTE;

	const params: GetItemCommandInput = {
		TableName: options.tableName || DEFAULT_TABLE_NAME,
		Key: {
			[keyAttribute]: { S: counterId }
		},
		ProjectionExpression: countAttribute,
		...options.dynamodb
	};

	const promise = new Promise<number>((resolve, reject) => {
		const command = new GetItemCommand(params);

		client.send(command)
			.then((data) => {
				try {
					let lastValue: number;

					if (!data.Item || !data.Item[countAttribute]) {
						// If the item doesn't exist, return 0
						lastValue = 0;
					} else {
						const countValue = data.Item[countAttribute];
						if (!countValue.N) {
							throw new Error('Count attribute is not a number');
						}

						lastValue = parseInt(countValue.N, 10);

						if (isNaN(lastValue)) {
							throw new Error(`Could not parse count value (${countValue.N})`);
						}
					}

					executeCallback(options.success, options.context, [lastValue]);
					executeCallback(options.complete, options.context, [lastValue]);

					resolve(lastValue);
				} catch (error) {
					executeCallback(options.error, options.context, [error]);
					executeCallback(options.complete, options.context, [error]);
					reject(error);
				}
			})
			.catch((error) => {
				executeCallback(options.error, options.context, [error]);
				executeCallback(options.complete, options.context, [error]);
				reject(error);
			});
	});

	return new AtomicCounterPromiseImpl(promise);
}

/**
 * Set a custom DynamoDB client instance
 */
export function setClient(client: DynamoDBClient): void {
	dynamoClient = client;
}

/**
 * Get the current DynamoDB client instance
 */
export function getClient(): DynamoDBClient {
	return getDynamoClient();
}
