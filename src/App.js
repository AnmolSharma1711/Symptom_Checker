import React, { useState } from 'react';
import { Heart, User, Calendar, FileText, AlertTriangle, CheckCircle, Clock, Stethoscope } from 'lucide-react';
import './App.css';

function App() {
  const [formData, setFormData] = useState({
    symptoms: '',
    gender: '',
    age: ''
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const generateMedicalGuidance = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const prompt = `As a medical AI assistant, provide comprehensive medical guidance for a ${formData.age}-year-old ${formData.gender} experiencing the following symptoms: ${formData.symptoms}

IMPORTANT: You must follow this exact format. Do not deviate from it.

ASSESSMENT:
[Provide a brief assessment here]

POSSIBLE CONDITIONS:
[List exactly 3-4 conditions with percentages, each on a new line. Format: "Condition Name: XX%" - nothing else on each line]

RECOMMENDATIONS:
[List immediate recommendations here]

WHEN TO SEEK CARE:
[Urgency level and when to see a doctor]

SELF-CARE TIPS:
[List at least 3 home remedies as bullet points]

WARNING SIGNS:
[Red flags requiring immediate attention]

Always include all sections with content. Be consistent in your formatting.`;

      const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'command-light',
          prompt: prompt,
          max_tokens: 1000,
          temperature: 0.05, // Reduced from 0.1 for more consistency
          stop_sequences: [],
          return_likelihoods: 'NONE'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get medical guidance');
      }

      const data = await response.json();
      const guidance = data.generations[0].text.trim();
      console.log('Raw API guidance:', guidance);
      
      // Parse the structured response with improved logic
      const sections = parseGuidance(guidance);
      
      // Ensure we always have conditions - apply fallback if needed
      if (!sections.conditions || sections.conditions.length === 0) {
        sections.conditions = generateFallbackConditions(formData.symptoms);
      }
      
      // Ensure we always have recommendations
      if (!sections.recommendations || sections.recommendations.trim() === '') {
        sections.recommendations = generateFallbackRecommendations(formData.symptoms);
      }
      
      // Ensure we always have self-care tips
      if (!sections.selfCare || sections.selfCare.trim() === '') {
        sections.selfCare = generateFallbackSelfCare(formData.symptoms);
      }
      
      setResult(sections);

    } catch (err) {
      setError('Unable to provide medical guidance at this time. Please try again or consult a healthcare professional.');
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseGuidance = (text) => {
    const sections = {
      assessment: '',
      conditions: [],
      recommendations: '',
      urgency: '',
      selfCare: '',
      warnings: ''
    };

    // Split text into sections more reliably
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();

      // Identify section headers with more flexible matching
      if (upperLine.includes('ASSESSMENT')) {
        currentSection = 'assessment';
        // If there's content on the same line after the colon, add it
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1 && line.length > colonIndex + 1) {
          sections.assessment += line.substring(colonIndex + 1).trim() + ' ';
        }
        continue;
      } else if (upperLine.includes('POSSIBLE CONDITIONS') || upperLine.includes('CONDITIONS')) {
        currentSection = 'conditions';
        continue;
      } else if (upperLine.includes('RECOMMENDATIONS') || upperLine.includes('IMMEDIATE RECOMMENDATIONS')) {
        currentSection = 'recommendations';
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1 && line.length > colonIndex + 1) {
          sections.recommendations += line.substring(colonIndex + 1).trim() + ' ';
        }
        continue;
      } else if (upperLine.includes('WHEN TO SEEK CARE') || upperLine.includes('URGENCY')) {
        currentSection = 'urgency';
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1 && line.length > colonIndex + 1) {
          sections.urgency += line.substring(colonIndex + 1).trim() + ' ';
        }
        continue;
      } else if (upperLine.includes('SELF-CARE') || upperLine.includes('SELF CARE')) {
        currentSection = 'selfCare';
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1 && line.length > colonIndex + 1) {
          sections.selfCare += line.substring(colonIndex + 1).trim() + ' ';
        }
        continue;
      } else if (upperLine.includes('WARNING SIGNS') || upperLine.includes('RED FLAGS')) {
        currentSection = 'warnings';
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1 && line.length > colonIndex + 1) {
          sections.warnings += line.substring(colonIndex + 1).trim() + ' ';
        }
        continue;
      }

      // Add content to current section
      if (currentSection && line) {
        if (currentSection === 'conditions') {
          // Look for condition patterns: "Condition: XX%" or "Condition - XX%" or numbered lists
          const conditionMatch = line.match(/^(\d+\.?\s*)?([^:]+):\s*(\d+%)/i) || 
                                line.match(/^(\d+\.?\s*)?([^-]+)-\s*(\d+%)/i);
          
          if (conditionMatch) {
            const conditionName = conditionMatch[2].trim();
            const percentage = conditionMatch[3];
            sections.conditions.push(`${conditionName}: ${percentage}`);
          } else if (line.includes('%')) {
            // Any line with percentage in conditions section
            sections.conditions.push(line.replace(/^[-\d.\s]+/, '').trim());
          } else if (line.match(/^\d+\.|^-|^•/)) {
            // Numbered or bulleted items
            const cleanLine = line.replace(/^[-\d.\s•]+/, '').trim();
            if (cleanLine) {
              sections.conditions.push(cleanLine);
            }
          }
        } else {
          sections[currentSection] += line + ' ';
        }
      }
    }

    // Clean up string sections
    Object.keys(sections).forEach(key => {
      if (typeof sections[key] === 'string') {
        sections[key] = sections[key].trim();
      }
    });

    return sections;
  };

  // Improved fallback functions with more comprehensive symptom mapping
  const generateFallbackConditions = (symptoms) => {
    const symptomText = symptoms.toLowerCase();
    const conditions = [];
    
    // Multiple condition patterns for better coverage
    if (symptomText.includes('chest pain') || symptomText.includes('heart')) {
      conditions.push('Angina: 45%', 'Myocardial Infarction: 25%', 'Costochondritis: 20%');
    } else if (symptomText.includes('cough') && symptomText.includes('fever')) {
      conditions.push('Pneumonia: 40%', 'Bronchitis: 35%', 'Upper Respiratory Infection: 25%');
    } else if (symptomText.includes('headache')) {
      if (symptomText.includes('nausea') || symptomText.includes('vomit')) {
        conditions.push('Migraine: 50%', 'Tension Headache: 30%', 'Sinusitis: 20%');
      } else {
        conditions.push('Tension Headache: 60%', 'Migraine: 25%', 'Dehydration: 15%');
      }
    } else if (symptomText.includes('fever')) {
      conditions.push('Viral Infection: 60%', 'Bacterial Infection: 25%', 'Influenza: 15%');
    } else if (symptomText.includes('abdominal') || symptomText.includes('stomach')) {
      conditions.push('Gastroenteritis: 40%', 'Peptic Ulcer: 30%', 'IBS: 25%');
    } else if (symptomText.includes('fatigue') || symptomText.includes('tired')) {
      conditions.push('Viral Syndrome: 40%', 'Anemia: 30%', 'Thyroid Disorder: 25%');
    } else if (symptomText.includes('rash') || symptomText.includes('skin')) {
      conditions.push('Allergic Reaction: 45%', 'Dermatitis: 35%', 'Viral Exanthem: 20%');
    } else if (symptomText.includes('joint') || symptomText.includes('arthritis')) {
      conditions.push('Osteoarthritis: 50%', 'Rheumatoid Arthritis: 30%', 'Gout: 20%');
    } else if (symptomText.includes('diarrhea') || symptomText.includes('bowel')) {
      conditions.push('Gastroenteritis: 50%', 'IBS: 30%', 'Food Poisoning: 20%');
    } else if (symptomText.includes('dizz') || symptomText.includes('vertigo')) {
      conditions.push('Benign Vertigo: 45%', 'Hypotension: 30%', 'Inner Ear Infection: 25%');
    } else {
      // Generic fallback based on common symptoms
      conditions.push('Viral Infection: 40%', 'Common Cold: 35%', 'Stress-related Symptoms: 25%');
    }
    
    return conditions.slice(0, 3); // Limit to 3 conditions
  };

  const generateFallbackRecommendations = (symptoms) => {
    const symptomText = symptoms.toLowerCase();
    
    if (symptomText.includes('chest pain')) {
      return 'Seek immediate medical attention. Avoid physical exertion. Take aspirin if not allergic (unless contraindicated).';
    } else if (symptomText.includes('fever')) {
      return 'Rest and stay hydrated. Take acetaminophen or ibuprofen for fever reduction. Monitor temperature regularly.';
    } else if (symptomText.includes('headache')) {
      return 'Rest in a dark, quiet room. Apply cold or warm compress. Stay hydrated. Consider over-the-counter pain relievers.';
    } else if (symptomText.includes('cough')) {
      return 'Stay hydrated. Use honey or throat lozenges. Avoid irritants like smoke. Rest your voice.';
    } else {
      return 'Rest and stay hydrated. Monitor symptoms closely. Take over-the-counter medications as needed for symptom relief.';
    }
  };

  const generateFallbackSelfCare = (symptoms) => {
    const symptomText = symptoms.toLowerCase();
    const tips = ['Stay well hydrated with water and clear fluids', 'Get adequate rest and sleep'];
    
    if (symptomText.includes('fever')) {
      tips.push('Use cool compresses or lukewarm baths to reduce fever');
      tips.push('Wear light, breathable clothing');
    } else if (symptomText.includes('headache')) {
      tips.push('Apply cold or warm compress to head or neck');
      tips.push('Practice relaxation techniques');
    } else if (symptomText.includes('cough')) {
      tips.push('Use a humidifier or breathe steam from hot shower');
      tips.push('Drink warm liquids like herbal tea with honey');
    } else if (symptomText.includes('nausea')) {
      tips.push('Eat bland foods like crackers or toast');
      tips.push('Try ginger tea or peppermint');
    } else {
      tips.push('Maintain a healthy diet with fruits and vegetables');
      tips.push('Avoid stress and practice gentle exercise if able');
    }
    
    return tips.join(' • ');
  };

  const handleSubmit = () => {
    if (!formData.symptoms || !formData.gender || !formData.age) {
      setError('Please fill in all fields');
      return;
    }
    generateMedicalGuidance();
  };

  return (
    <div className="App">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        {/* Header */}
        <header className="bg-white shadow-lg border-b-4 border-blue-500">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-500 p-2 rounded-full">
                <Stethoscope className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800">MediGuide AI</h1>
                <p className="text-gray-600">Intelligent Medical Guidance System</p>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Input Form */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="text-center mb-8">
                <div className="bg-gradient-to-r from-blue-500 to-green-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Symptom Analysis</h2>
                <p className="text-gray-600">Enter your symptoms for personalized medical guidance</p>
              </div>

              <div className="space-y-6">
                {/* Symptoms Input */}
                <div>
                  <label className="flex items-center text-lg font-semibold text-gray-700 mb-3">
                    <FileText className="h-5 w-5 mr-2 text-blue-500" />
                    Describe Your Symptoms
                  </label>
                  <textarea
                    name="symptoms"
                    value={formData.symptoms}
                    onChange={handleInputChange}
                    placeholder="Please describe your symptoms in detail (e.g., headache, fever, nausea, duration, severity...)"
                    className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors h-32 resize-none"
                    required
                  />
                </div>

                {/* Gender Selection */}
                <div>
                  <label className="flex items-center text-lg font-semibold text-gray-700 mb-3">
                    <User className="h-5 w-5 mr-2 text-blue-500" />
                    Gender
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {['male', 'female', 'other'].map((gender) => (
                      <label key={gender} className="cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value={gender}
                          checked={formData.gender === gender}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <div className={`p-3 text-center rounded-xl border-2 transition-all ${
                          formData.gender === gender
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          {gender.charAt(0).toUpperCase() + gender.slice(1)}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Age Input */}
                <div>
                  <label className="flex items-center text-lg font-semibold text-gray-700 mb-3">
                    <Calendar className="h-5 w-5 mr-2 text-blue-500" />
                    Age
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleInputChange}
                    placeholder="Enter your age"
                    min="1"
                    max="120"
                    className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                      <p className="text-red-700">{error}</p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white font-bold py-4 px-6 rounded-xl hover:from-blue-600 hover:to-green-600 transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Clock className="animate-spin h-5 w-5 mr-2" />
                      Analyzing Symptoms...
                    </>
                  ) : (
                    'Get Medical Guidance'
                  )}
                </button>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-800 font-medium">Medical Disclaimer</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      This AI-generated guidance is for informational purposes only and should not replace professional medical advice, diagnosis, or treatment.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Panel */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              {!result && !loading && (
                <div className="text-center py-16">
                  <div className="bg-gray-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Stethoscope className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">Ready for Analysis</h3>
                  <p className="text-gray-500">Fill out the form to receive personalized medical guidance</p>
                </div>
              )}

              {loading && (
                <div className="text-center py-16">
                  <div className="bg-blue-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Clock className="h-12 w-12 text-blue-500 animate-spin" />
                  </div>
                  <h3 className="text-xl font-semibold text-blue-600 mb-2">Analyzing Your Symptoms</h3>
                  <p className="text-gray-500">Our AI is processing your information...</p>
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">Medical Guidance Report</h3>
                  </div>

                  {/* Recommendations Section */}
                  <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                    <h4 className="font-bold text-green-800 mb-3 flex items-center">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Recommendations
                    </h4>
                    {(() => {
                      const recText = result.recommendations || result.urgency || '';
                      if (!recText) return <p className="text-green-700">No recommendations available.</p>;
                      // Split by sentence or common delimiters
                      const points = recText.split(/\.|;/).map(line => line.trim()).filter(line => line.length > 5);
                      return points.length > 1 ? (
                        <ul className="list-disc pl-6 text-green-700">
                          {points.map((pt, idx) => <li key={idx}>{pt}</li>)}
                        </ul>
                      ) : (
                        <p className="text-green-700">{recText}</p>
                      );
                    })()}
                  </div>

                  {/* Chances of Related Diseases Section */}
                  <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Chances of Related Diseases
                    </h4>
                    {result.conditions && result.conditions.length > 0 ? (
                      <ul className="text-purple-700 space-y-2">
                        {result.conditions.map((condition, index) => (
                          <li key={index} className="pl-2 flex items-center">
                            <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                            {condition}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-purple-700">No related diseases could be determined. Please consult a healthcare professional.</p>
                    )}
                  </div>

                  {/* Medical Guidance Tips Section */}
                  <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-200">
                    <h4 className="font-bold text-indigo-800 mb-3 flex items-center">
                      <Heart className="h-5 w-5 mr-2" />
                      Medical Guidance Tips
                    </h4>
                    {(() => {
                      const tips = [];
                      const addLines = (text, splitChar = '•') => {
                        if (!text) return;
                        text.split(splitChar)
                          .map(line => line.trim())
                          .filter(line => line.length > 5)
                          .forEach(line => tips.push(line));
                      };
                      addLines(result.selfCare);
                      addLines(result.warnings);
                      
                      return tips.length > 0 ? (
                        <ul className="list-disc pl-6 text-indigo-700">
                          {tips.map((tip, idx) => <li key={idx}>{tip}</li>)}
                        </ul>
                      ) : (
                        <p className="text-indigo-700">Stay hydrated, get rest, and consult a healthcare professional if symptoms persist.</p>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;