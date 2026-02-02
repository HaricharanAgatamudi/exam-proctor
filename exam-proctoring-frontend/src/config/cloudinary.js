const CLOUD_NAME = 'dror3nw61';
const UPLOAD_PRESET = 'exam_proctor_uploads';

export const uploadToCloudinary = async (file, fileName, folder, resourceType = 'video') => {
  try {
    console.log(`☁️ Uploading ${fileName} to Cloudinary...`);
    console.log(`📁 Folder: ${folder}`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    // ✅ YOUR CLOUDINARY STRUCTURE: exam_proctor/recordings/...
    const fullFolder = `exam_proctor/recordings/${folder}`;
    formData.append('folder', fullFolder);
    formData.append('resource_type', resourceType);
    formData.append('public_id', fileName.replace(/\.[^/.]+$/, ''));

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Upload failed');
    }

    const data = await response.json();
    
    console.log('✅ Upload successful:', data.secure_url);

    return {
      url: data.secure_url,
      publicId: data.public_id,
      format: data.format,
      resourceType: data.resource_type
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
};