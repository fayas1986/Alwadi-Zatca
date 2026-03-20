
import React, { useState } from 'react';
import { X, Building, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { Organization, Branch } from '../types';

interface CreateOrganizationModalProps {
  onClose: () => void;
  onCreate: (orgData: any) => void;
  users?: any[];
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({ onClose, onCreate, users = [] }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    vatNumber: '',
    crNumber: '',
    branchName: 'Headquarters',
    streetName: '',
    buildingNumber: '',
    city: 'Riyadh',
    district: '',
    postalCode: '',
    ownerId: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Company Name is required';
    if (!formData.vatNumber) newErrors.vatNumber = 'VAT Number is required';
    else if (!/^3\d{13}3$/.test(formData.vatNumber)) newErrors.vatNumber = 'Invalid VAT format (15 digits, starts/ends with 3)';
    
    if (!formData.streetName) newErrors.streetName = 'Street is required';
    if (!formData.buildingNumber) newErrors.buildingNumber = 'Building No. is required';
    if (!formData.district) newErrors.district = 'District is required';
    if (!formData.postalCode) newErrors.postalCode = 'Postal Code is required';
    
    if (users.length > 0 && !formData.ownerId) newErrors.ownerId = 'Owner assignment is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    // Send the raw form data to App.tsx which will handle the POST request
    onCreate({
      name: formData.name,
      vatNumber: formData.vatNumber,
      crNumber: formData.crNumber,
      branchName: formData.branchName,
      address: formData.streetName,
      city: formData.city,
      country: 'SA',
      groupId: null,
      ownerId: formData.ownerId
    });
  };

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm text-slate-900 placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-lg text-slate-900 flex items-center">
            <Building className="mr-2 text-indigo-600" size={20} />
            Register New Company
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="space-y-6">
            {/* Identity Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2">Organization Identity</h4>
              
              {users.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assign to Owner (Tenant User)</label>
                  <select 
                    className={`${inputClass} ${errors.ownerId ? 'border-rose-300' : ''} bg-indigo-50/50 border-indigo-100`}
                    value={formData.ownerId}
                    onChange={e => setFormData({...formData, ownerId: e.target.value})}
                  >
                    <option value="">-- Select Owner --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                  {errors.ownerId && <p className="text-xs text-rose-500 mt-1">{errors.ownerId}</p>}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company Name (English)</label>
                <input 
                  type="text" 
                  className={`${inputClass} ${errors.name ? 'border-rose-300' : ''}`}
                  placeholder="e.g. Future Tech LLC"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
                {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">VAT Number</label>
                  <input 
                    type="text" 
                    className={`${inputClass} font-mono ${errors.vatNumber ? 'border-rose-300' : ''}`}
                    placeholder="3xxxxxxxxxxxxx3"
                    maxLength={15}
                    value={formData.vatNumber}
                    onChange={e => setFormData({...formData, vatNumber: e.target.value})}
                  />
                  {errors.vatNumber && <p className="text-xs text-rose-500 mt-1">{errors.vatNumber}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CR Number</label>
                  <input 
                    type="text" 
                    className={`${inputClass} font-mono`}
                    placeholder="1010xxxxxx"
                    value={formData.crNumber}
                    onChange={e => setFormData({...formData, crNumber: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 mb-2 flex items-center">
                <MapPin size={16} className="mr-2" /> HQ National Address
              </h4>
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Primary Branch Name</label>
                    <input 
                      type="text" 
                      className={inputClass}
                      value={formData.branchName}
                      onChange={e => setFormData({...formData, branchName: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Building No.</label>
                    <input 
                      type="text" 
                      className={`${inputClass} ${errors.buildingNumber ? 'border-rose-300' : ''}`}
                      placeholder="0000"
                      value={formData.buildingNumber}
                      onChange={e => setFormData({...formData, buildingNumber: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Street Name</label>
                    <input 
                      type="text" 
                      className={`${inputClass} ${errors.streetName ? 'border-rose-300' : ''}`}
                      placeholder="Street Name"
                      value={formData.streetName}
                      onChange={e => setFormData({...formData, streetName: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">District</label>
                    <input 
                      type="text" 
                      className={`${inputClass} ${errors.district ? 'border-rose-300' : ''}`}
                      placeholder="District"
                      value={formData.district}
                      onChange={e => setFormData({...formData, district: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">City</label>
                    <select 
                      className={inputClass}
                      value={formData.city}
                      onChange={e => setFormData({...formData, city: e.target.value})}
                    >
                        <option>Riyadh</option>
                        <option>Jeddah</option>
                        <option>Dammam</option>
                        <option>Khobar</option>
                        <option>Mecca</option>
                        <option>Medina</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Postal Code</label>
                    <input 
                      type="text" 
                      className={`${inputClass} ${errors.postalCode ? 'border-rose-300' : ''}`}
                      placeholder="12345"
                      value={formData.postalCode}
                      onChange={e => setFormData({...formData, postalCode: e.target.value})}
                    />
                 </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 active:scale-95 flex items-center"
          >
            <CheckCircle size={18} className="mr-2" /> Register Company
          </button>
        </div>
      </div>
    </div>
  );
};
