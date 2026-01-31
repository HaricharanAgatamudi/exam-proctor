const CLOUD_NAME = 'dror3nw61';
const UPLOAD_PRESET = 'exam_proctor_uploads';

export const uploadToCloudinary = async (file, fileName, folder, resourceType = 'video') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);
  formData.append('public_id', fileName);
  formData.append('resource_type', resourceType);
  
  try {
    console.log(`Uploading ${resourceType} to Cloudinary...`);
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      {
        method: 'POST',
        body: formData
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Cloudinary error:', errorData);
      throw new Error(errorData.error?.message || 'Upload failed');
    }
    
    const data = await response.json();
    console.log(`${resourceType} uploaded successfully:`, data.secure_url);
    
    return {
      url: data.secure_url,
      publicId: data.public_id,
      format: data.format,
      duration: data.duration,
      bytes: data.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

export const getCloudinaryUrl = (publicId) => {
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${publicId}`;
};