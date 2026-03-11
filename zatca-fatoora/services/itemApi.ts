import { Item } from '../types';

const API_BASE_URL = '/api/items';

export const getItems = async (companyId: string): Promise<Item[]> => {
    const response = await fetch(`${API_BASE_URL}?companyId=${companyId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch items');
    }
    return response.json();
};

export const createItem = async (item: Omit<Item, 'id'>): Promise<Item> => {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    });
    if (!response.ok) {
        throw new Error('Failed to create item');
    }
    return response.json();
};

export const updateItem = async (id: string, item: Partial<Item>): Promise<Item> => {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    });
    if (!response.ok) {
        throw new Error('Failed to update item');
    }
    return response.json();
};

export const deleteItem = async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error('Failed to delete item');
    }
};

export const bulkCreateItems = async (items: Omit<Item, 'id' | 'companyId'>[], companyId: string): Promise<{ count: number }> => {
    const response = await fetch(`${API_BASE_URL}/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, companyId })
    });
    if (!response.ok) {
        throw new Error('Failed to bulk create items');
    }
    return response.json();
};
