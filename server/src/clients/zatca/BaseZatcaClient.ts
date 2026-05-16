
import axios, { AxiosInstance } from 'axios';
import { FailoverManager } from '../../utils/zatcaFailover.js';
import { maskSensitiveData } from '../../utils/zatcaUtils.js';

export abstract class BaseZatcaClient {
    protected axiosInstance: AxiosInstance;
    protected abstract baseUrl: string;

    constructor() {
        this.axiosInstance = axios.create({
            headers: {
                'Accept-Version': 'V2',
                'Content-Type': 'application/json',
                'Accept-Language': 'en'
            }
        });

        // Failover interceptor
        this.axiosInstance.interceptors.request.use(async (config) => {
            await FailoverManager.tryRestore();
            return config;
        });

        this.axiosInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status >= 500) {
                    await FailoverManager.markFailure();
                }
                return Promise.reject(error);
            }
        );
    }

    protected async post<T>(path: string, data: any, headers: any = {}): Promise<T> {
        const url = this.getUrl(path);
        try {
            const response = await this.axiosInstance.post<T>(url, data, { headers });
            return response.data;
        } catch (error: any) {
            console.error(`[ZATCA Client] API Error:`, {
                url,
                status: error.response?.status,
                data: error.response ? maskSensitiveData(error.response.data) : 'NO_RESPONSE',
                requestData: maskSensitiveData(data)
            });
            throw error;
        }
    }

    protected getAuthHeader(csid: string, secret: string): string {
        return `Basic ${Buffer.from(`${csid}:${secret}`).toString('base64')}`;
    }

    protected getUrl(path: string): string {
        const regionSuffix = FailoverManager.primaryRegion === 'secondary' ? '?region=secondary' : '';
        return `${this.baseUrl}${path}${regionSuffix}`;
    }
}
