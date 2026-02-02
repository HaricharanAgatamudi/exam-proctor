import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      // Make env variables available at build time
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(
        env.VITE_BACKEND_URL || 'https://exam-proctor-backend-jxrb.onrender.com'
      ),
      'import.meta.env.VITE_PYTHON_PROCTOR_URL': JSON.stringify(
        env.VITE_PYTHON_PROCTOR_URL || 'https://exam-proctor-ai.onrender.com'
      ),
      'import.meta.env.VITE_CLOUDINARY_CLOUD_NAME': JSON.stringify(
        env.VITE_CLOUDINARY_CLOUD_NAME || 'dror3nw61'
      ),
      'import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET': JSON.stringify(
        env.VITE_CLOUDINARY_UPLOAD_PRESET || 'exam_proctor_uploads'
      )
    }
  }
})