import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import type { SearchRequest, SearchResponse } from '../api'
import { useApi } from '../api'
import {
	ADV_QUERY_BATCH_RETRY_ATTEMPTS,
	ADV_QUERY_BATCH_RETRY_DELAY_MS,
	ADV_QUERY_INTER_BATCH_DELAY_MS,
	sleep,
} from '../search-config'

const API_CODE = import.meta.env.VITE_API_CODE

const codeParam = API_CODE ? `?code=${API_CODE}` : ''

export const useSearchBooks = () => {
	const api = useApi()

	return useMutation<
		SearchResponse,
		Error,
		SearchRequest & {
			batchSize?: string
			onBatchProgress?: (
				current: number,
				total: number,
			) => void
			onBatchResult?: (args: {
				batchIndex: number
				totalBatches: number
				response: SearchResponse
			}) => Promise<void> | void

			// Advanced Query optional retry configuration
			enableRetry?: boolean
			retryAttempts?: number
			retryDelayMs?: number
			interBatchDelayMs?: number

			// Cancellation controls (Advanced Query only)
			abortSignal?: AbortSignal
			shouldCancelRef?: { current: boolean }
		}
	>({
		mutationFn: async (data) => {
			const {
				books,
				batchSize = 'ALL',
				onBatchProgress,
				onBatchResult,
				enableRetry = false,
				retryAttempts = ADV_QUERY_BATCH_RETRY_ATTEMPTS,
				retryDelayMs = ADV_QUERY_BATCH_RETRY_DELAY_MS,
				interBatchDelayMs = ADV_QUERY_INTER_BATCH_DELAY_MS,
				abortSignal,
				shouldCancelRef,
				...rest
			} = data

			if (!books || books.length === 0) {
				return {
					success: true,
					books: [],
					total_processed: 0,
					api_usage_remaining: 0,
					cancelled: false,
				}
			}

			const parsedBatchSize =
				batchSize === 'ALL'
					? books.length
					: Number.parseInt(batchSize, 10)

			const batchSizeNum =
				Number.isFinite(parsedBatchSize) &&
				parsedBatchSize > 0
					? parsedBatchSize
					: books.length

			const batches = []

			// Split books into batches of specified size
			for (
				let i = 0;
				i < books.length;
				i += batchSizeNum
			) {
				batches.push(
					books.slice(i, i + batchSizeNum),
				)
			}

			const results: SearchResponse['books'] = []

			let totalProcessed = 0
			let apiUsageRemaining = 0
			let wasCancelled = false

			const sleepCancellable = (ms: number) =>
				new Promise<void>((resolve) => {
					const timer = setTimeout(
						() => resolve(),
						ms,
					)

					if (abortSignal) {
						const onAbort = () => {
							clearTimeout(timer)
							resolve()

							abortSignal.removeEventListener(
								'abort',
								onAbort,
							)
						}

						abortSignal.addEventListener(
							'abort',
							onAbort,
							{ once: true },
						)
					}
				})

			const getErrorMessage = (
				error: unknown,
			): string => {
				if (axios.isAxiosError(error)) {
					const status =
						error.response?.status

					const data =
						error.response?.data

					const serverMessage =
						data?.detail ||
						data?.error ||
						data?.message

					if (serverMessage) {
						return status
							? `HTTP ${status}: ${serverMessage}`
							: String(serverMessage)
					}

					if (status) {
						return `HTTP ${status}: ${error.message}`
					}

					return error.message
				}

				if (error instanceof Error) {
					return error.message
				}

				return String(error)
			}

			// Process each batch
			for (
				let i = 0;
				i < batches.length;
				i++
			) {
				// Early exit if cancellation requested
				if (
					shouldCancelRef?.current ||
					abortSignal?.aborted
				) {
					wasCancelled = true
					break
				}

				const batch = batches[i]

				onBatchProgress?.(
					i + 1,
					batches.length,
				)

				const attemptBatch = async () => {
					const response =
						await api.post<SearchResponse>(
							`/search_books${codeParam}`,
							{
								...rest,
								books: batch,
							},
							{
								signal: abortSignal,
								headers: {
									'Content-Type':
										'application/json',
								},

								/*
								 * Explicitly include the
								 * Snapicat session cookie.
								 *
								 * The Axios instance also
								 * specifies this globally,
								 * but keeping it here makes
								 * authentication behavior
								 * explicit for this important
								 * request.
								 */
								withCredentials: true,
							},
						)

					return response
				}

				let response: {
					data: SearchResponse
				} | null = null

				if (enableRetry) {
					let attempt = 0
					let lastError: unknown = null

					while (attempt < retryAttempts) {
						try {
							response =
								await attemptBatch()

							break
						} catch (error) {
							lastError = error

							console.error(
								`Search Books batch ${
									i + 1
								}/${batches.length} failed on attempt ${
									attempt + 1
								}/${retryAttempts}:`,
								error,
							)

							if (
								axios.isAxiosError(
									error,
								)
							) {
								console.error(
									'Search Books HTTP error:',
									{
										status:
											error
												.response
												?.status,
										data:
											error
												.response
												?.data,
										url:
											error
												.config
												?.url,
									},
								)
							}

							// If user cancelled,
							// stop retrying.
							if (
								shouldCancelRef?.current ||
								abortSignal?.aborted
							) {
								wasCancelled = true
								response = null
								break
							}

							attempt++

							if (
								attempt >=
								retryAttempts
							) {
								const errorMessage =
									getErrorMessage(
										lastError,
									)

								/*
								 * Preserve the actual
								 * backend/OCLC error on
								 * each affected row.
								 */
								const failed =
									batch.map(
										(b) => ({
											rowId:
												b.rowId,
											error: `Batch failed after ${retryAttempts} retries. ${errorMessage}`,
										}),
									)

								results.push(
									...failed,
								)

								response = null
								break
							}

							await sleep(
								retryDelayMs,
							)
						}
					}

					if (wasCancelled) {
						break
					}
				} else {
					try {
						response =
							await attemptBatch()
					} catch (error) {
						console.error(
							'Search Books request failed:',
							error,
						)

						if (
							axios.isAxiosError(
								error,
							)
						) {
							console.error(
								'Search Books HTTP error:',
								{
									status:
										error
											.response
											?.status,
									data:
										error
											.response
											?.data,
									url:
										error
											.config
											?.url,
								},
							)
						}

						throw error
					}
				}

				if (response) {
					results.push(
						...response.data.books,
					)

					totalProcessed +=
						response.data
							.total_processed || 0

					apiUsageRemaining =
						response.data
							.api_usage_remaining || 0

					if (onBatchResult) {
						await onBatchResult({
							batchIndex: i + 1,
							totalBatches:
								batches.length,
							response:
								response.data,
						})
					}
				} else if (
					enableRetry &&
					onBatchResult
				) {
					const synthetic: SearchResponse = {
						success: false,
						books: [],
						total_processed:
							totalProcessed,
						api_usage_remaining:
							apiUsageRemaining,
					}

					await onBatchResult({
						batchIndex: i + 1,
						totalBatches:
							batches.length,
						response: synthetic,
					})
				}

				// Wait between batches, but only
				// when additional batches remain.
				if (i < batches.length - 1) {
					if (
						abortSignal?.aborted ||
						shouldCancelRef?.current
					) {
						wasCancelled = true
						break
					}

					await sleepCancellable(
						interBatchDelayMs,
					)
				}
			}

			return {
				success: !wasCancelled,
				books: results,
				total_processed: totalProcessed,
				api_usage_remaining:
					apiUsageRemaining,
				cancelled: wasCancelled,
			}
		},
	})
}