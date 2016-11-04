/**
 * @module parallel
 */
/** needed, typedoc issue */

import {IThreadPool} from "../thread-pool/thread-pool";
import {IParallelJobScheduler} from "./scheduling/parallel-job-scheduler";
import {FunctionCallSerializer} from "../function/function-call-serializer";

/**
 * Options that affect how a parallel operation is executed.
 */
export interface IParallelOptions {

    /**
     * Serializer used to serialize {@link FunctionCall}s
     */
    functionCallSerializer?: FunctionCallSerializer;

    /**
     * Maximum number of workers that can run in parallel (without blocking each other)
     */
    maxConcurrencyLevel?: number;

    /**
     * The minimum number of values assigned to a single task before the work is split and assigned another task
     */
    minValuesPerTask?: number;

    /**
     * The maximum number of values assigned to a single task. If the number of values exceed the maxValuesPerTask, an additional
     * task is created to process the values (until the values per Task are less then maxValuesPerTask)
     */
    maxValuesPerTask?: number;

    /**
     * The thread pool to use to schedule the tasks
     */
    threadPool?: IThreadPool;

    /**
     * The scheduler that should be used to determine the number of tasks to create.
     */
    scheduler?: IParallelJobScheduler;

    /**
     * Allow the {@link IParallelOptions.scheduler} to create more than {@link IParallelOptions.maxConcurrency} tasks
     * for a single job. By default this is desired but might increases computation time if the initialization of the environment
     * is very compute intensive (compared to the computation needed to transform the elements).
     * This option is only a hint for the scheduler. Actual implementations may ignore the option at all or interpret it less strict.
     * @default true
     */
    oversubscribe?: boolean;
}

/**
 * Initialized parallel options
 */
export interface IDefaultInitializedParallelOptions extends IParallelOptions {
    functionCallSerializer: FunctionCallSerializer;
    maxConcurrencyLevel: number;
    threadPool: IThreadPool;
    scheduler: IParallelJobScheduler;
    oversubscribe: boolean;
}
