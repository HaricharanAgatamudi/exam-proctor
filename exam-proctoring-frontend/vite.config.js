import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ HARDCODED URLs - NO MORE ENV VARIABLES!
export default defineConfig({
  plugins: [react()],
  
  // ✅ THIS MAKES IT WORK ON VERCEL!
  define: {
    'import.meta.env.VITE_BACKEND_URL': JSON.stringify('https://exam-proctor-backend-jxrb.onrender.com'),
    'import.meta.env.VITE_PYTHON_PROCTOR_URL': JSON.stringify('https://exam-proctor-ai.onrender.com'),
    'import.meta.env.VITE_CLOUDINARY_CLOUD_NAME': JSON.stringify('dror3nw61'),
    'import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET': JSON.stringify('exam_proctor_uploads')
  }
})