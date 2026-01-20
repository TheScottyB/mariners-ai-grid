import { createContext, useContext } from 'react';
import { DB } from '@op-engineering/op-sqlite';

export const SQLiteContext = createContext<DB | null>(null);
export const useSQLiteContext = () => useContext(SQLiteContext);