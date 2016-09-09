import {IParallelChain} from "./parallel-chain";
import {IParallelStream, ParallelStreamImpl} from "./parallel-stream";
import {IParallelTaskScheduling} from "./parallel-task-scheduling";
import {TaskDefinition} from "../task/task-definition";
import {IParallelGenerator} from "./parallel-generator";
import {IParallelAction} from "./parallel-action";
import {DefaultInitializedParallelOptions} from "./parallel-options";
import {ParallelWorkerFunctions} from "./parallel-worker-functions";
import {IEmptyParallelEnvironment, IParallelTaskEnvironment} from "./parallel-environment";

export function createParallelChain<TIn, TOut>(generator: IParallelGenerator, options: DefaultInitializedParallelOptions, actions?: IParallelAction[]): ParallelChainImpl<TIn, IEmptyParallelEnvironment, TOut>;
export function createParallelChain<TIn, TEnv extends IEmptyParallelEnvironment, TOut>(generator: IParallelGenerator, options: DefaultInitializedParallelOptions, sharedEnv: TEnv, actions?: IParallelAction[]): ParallelChainImpl<TIn, TEnv, TOut>;

export function createParallelChain<TIn, TEnv extends IEmptyParallelEnvironment, TOut>(generator: IParallelGenerator, options: DefaultInitializedParallelOptions, sharedEnv?: TEnv | IParallelAction[], actions: IParallelAction[] = []): ParallelChainImpl<TIn, TEnv, TOut> {
    let environment: TEnv;

    if (!sharedEnv) {
        environment = {} as any;
    } else if (sharedEnv instanceof Array) {
        environment = {} as any;
        actions = sharedEnv;
    } else {
        environment = sharedEnv;
    }

    return new ParallelChainImpl(generator, options, environment, actions);
}

export class ParallelChainImpl<TIn, TEnv extends {}, TOut> implements IParallelChain<TIn, TEnv, TOut> {

    public generator: IParallelGenerator;
    private options: DefaultInitializedParallelOptions;
    private sharedEnvironment: TEnv;
    private actions: IParallelAction[];

    constructor(generator: IParallelGenerator, options: DefaultInitializedParallelOptions, sharedEnv: TEnv, actions: IParallelAction[] = []) {
        this.generator = generator;
        this.options = options;
        this.sharedEnvironment = sharedEnv;
        this.actions = actions;
    }

    public environment<TEnvNew extends TEnv>(newEnv?: TEnvNew): any {
        if (!newEnv) {
            return this.sharedEnvironment;
        }
        return new ParallelChainImpl<TIn, TEnvNew, TOut>(this.generator, this.options, newEnv, this.actions);
    }

    public map<TResult>(mapper: (this: void, element: TOut, env: TEnv & IParallelTaskEnvironment) => TResult): IParallelChain<TIn, TEnv, TResult> {
        return this._chain<TResult>(ParallelWorkerFunctions.map, mapper);
    }

    public reduce<TResult>(defaultValue: TResult, accumulator: (this: void, memo: TResult, value: TOut, env: TEnv & IParallelTaskEnvironment) => TResult, combiner?: (this: void, sub1: TResult, sub2: TResult) => TResult): IParallelStream<TResult[], TResult> {
        let combineOperation: (accumulatedValue: TResult, value: TResult) => TResult;

        if (!combiner) {
            combineOperation = accumulator as any;
        }

        const stream = this._chain(ParallelWorkerFunctions.reduce, accumulator, defaultValue)._stream((intermediateResults: TResult[][]) => {
            let sum = defaultValue;

            for (const temp of intermediateResults) {
                sum = combineOperation(sum, temp[0]);
            }

            return sum;
        });
        return stream;
    }

    public filter(predicate: (this: void, value: TOut, env: TEnv & IParallelTaskEnvironment) => boolean): IParallelChain<TIn, TEnv, TOut> {
        return this._chain<TOut>(ParallelWorkerFunctions.filter, predicate);
    }

    public result(): IParallelStream<TOut[], TOut[]> {
        return this._stream<TOut[], TOut[]>((intermediateValue: TOut[][]) => {
            if (intermediateValue.length === 0) {
                return [];
            }
            const [head, ...tail] = intermediateValue;
            return Array.prototype.concat.apply(head, tail);
        });
    }

    public getParallelTaskScheduling(totalItems: number): IParallelTaskScheduling {
        let itemsPerWorker = totalItems / this.options.maxConcurrencyLevel;

        if (this.options.minValuesPerWorker) {
            itemsPerWorker = Math.min(Math.max(itemsPerWorker, this.options.minValuesPerWorker), totalItems);
        }

        if (this.options.maxValuesPerWorker) {
            itemsPerWorker = Math.min(itemsPerWorker, this.options.maxValuesPerWorker);
        }

        return {
            numberOfWorkers: Math.round(totalItems / itemsPerWorker),
            valuesPerWorker: Math.ceil(itemsPerWorker)
        };
    }

    private _stream<T, TResult>(joiner: (taskResults: T[]) => TResult | PromiseLike<TResult>): IParallelStream<T, TResult> {
        const tasks = this.getTaskDefinitions().map(definition => this.options.threadPool.scheduleTask<T>(definition));

        return new ParallelStreamImpl<T, TResult>(tasks, joiner);
    }

    private getTaskDefinitions(): TaskDefinition[] {
        const taskDefinitions: TaskDefinition[] = [];
        const scheduling = this.getParallelTaskScheduling(this.generator.length);
        const functionCallSerializer = this.options.threadPool.createFunctionSerializer();

        const serializedActions = this.actions.map(action => {
            return {
                coordinator: functionCallSerializer.serializeFunctionCall(action.coordinator, ...action.coordinatorParams),
                iteratee: functionCallSerializer.serializeFunctionCall(action.iteratee)
            };
        });

        for (let i = 0; i < scheduling.numberOfWorkers; ++i) {
            const environment = Object.assign<IParallelTaskEnvironment, TEnv>({ taskIndex: i }, this.sharedEnvironment);
            const generator = this.generator.serializeSlice(i, scheduling.valuesPerWorker, functionCallSerializer);

            const taskDefinition = {
                main: functionCallSerializer.serializeFunctionCall(ParallelWorkerFunctions.process, generator, serializedActions, environment),
                usedFunctionIds: functionCallSerializer.serializedFunctionIds
            };

            taskDefinitions.push(taskDefinition);
        }
        return taskDefinitions;
    }

    private _chain<TResult> (func: Function, iteratee: Function, ...params: any[]): ParallelChainImpl<TIn, TEnv, TResult> {
        const action = { coordinator: func, iteratee, coordinatorParams: params };
        return new ParallelChainImpl(this.generator, this.options, this.sharedEnvironment, [...this.actions, action]);
    }
}