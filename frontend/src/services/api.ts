import axios from 'axios';

// L'adresse de ton backend Python
const API_URL = 'http://127.0.0.1:8002';

export interface Biopsy {
  id: number;
  image_url: string;
  status: string;
}

export interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  biopsies: Biopsy[];
}

// Fonction pour récupérer la liste des patients
export const getPatients = async (): Promise<Patient[]> => {
  try {
    const response = await axios.get(`${API_URL}/patients`);
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la récupération des patients", error);
    return [];
  }
};

export interface AIResult {
  cancer_detected: boolean;
  confidence: number;
  cells_count: number;
  regions_found: number;
}

// Fonction pour lancer l'analyse
export const analyzeBiopsy = async (id: number): Promise<AIResult | null> => {
  try {
    const response = await axios.post(`${API_URL}/biopsies/${id}/analyze`);
    return response.data;
  } catch (error) {
    console.error("Erreur analyse IA", error);
    return null;
  }
};