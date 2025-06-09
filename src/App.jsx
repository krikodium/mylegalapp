import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, serverTimestamp, deleteDoc } from 'firebase/firestore'; 
import * as pdfjsLib from 'pdfjs-dist'; 

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;


// Define Firebase and app specific global variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID 
};

const myAppId = 'legal-docs-app-v1'; 


// Utility function to get the first line as a title
function getDocumentTitle(content) {
  if (!content) return 'Documento sin título';
  const firstLine = content.split('\n')[0];
  return firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '');
}

// Reusable Spinner Icon component
function SpinnerIcon() {
  return (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

// Summary Modal Component
function SummaryModal({ summaryContent, onClose, isLoading }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl text-center relative max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-primary-dark mb-4">Resumen del Documento ✨</h3>
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <SpinnerIcon />
            <span className="ml-2 text-text-medium">Generando resumen...</span>
          </div>
        ) : (
          <div className="text-left text-text-dark whitespace-pre-wrap mb-6 border border-gray-200 p-4 rounded-lg bg-gray-50 max-h-96 overflow-y-auto">
            {summaryContent || "No se pudo generar un resumen."}
          </div>
        )}
        <button
          onClick={onClose}
          className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-5 rounded-lg transition-colors duration-200 shadow-md"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// Review Modal Component
function ReviewModal({ reviewContent, onClose, isLoading }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl text-center relative max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-primary-dark mb-4">Revisión del Documento por IA ✨</h3>
        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <SpinnerIcon />
            <span className="ml-2 text-text-medium">Revisando documento...</span>
          </div>
        ) : (
          <div className="text-left text-text-dark whitespace-pre-wrap mb-6 border border-gray-200 p-4 rounded-lg bg-gray-50 max-h-96 overflow-y-auto">
            {reviewContent || "No se pudo generar una revisión."}
          </div>
        )}
        <button
          onClick={onClose}
          className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-5 rounded-lg transition-colors duration-200 shadow-md"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// AssistantChatModal Component
function AssistantChatModal({ chatHistory, onSendMessage, onClose, isLoading }) {
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null); 

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const handleSend = () => {
    if (input.trim()) { // Only send if input is not empty
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md h-[80vh] flex flex-col relative">
        <h3 className="text-2xl font-bold text-primary-dark mb-4 text-center font-sans">Asistente Legal AI 🤖</h3>
        <div className="flex-grow overflow-y-auto border border-gray-200 rounded-lg p-3 mb-4 space-y-3 custom-scrollbar">
          {chatHistory.length === 0 && (
              <p className="text-text-medium text-center italic font-serif">Hola, soy tu Asistente Legal. ¿En qué puedo ayudarte hoy?</p>
          )}
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-2 rounded-lg ${
                msg.role === 'user' ? 'bg-primary-dark text-white' : 'bg-gray-200 text-text-dark'
              }`}>
                <p className="font-serif">{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} /> 
        </div>
        
        <div className="flex">
          <input
            type="text"
            className="flex-grow p-2 border border-primary-light rounded-l-lg focus:ring-2 focus:ring-primary-dark focus:border-transparent text-text-dark font-serif"
            placeholder="Escribe tu pregunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-4 rounded-r-lg transition-colors duration-200 shadow-md"
            disabled={isLoading}
          >
            Enviar
          </button>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// DocumentEditor Component
function DocumentEditor({
  documentContent, setDocumentContent, promptInput, setPromptInput,
  isLoading, handleGenerateDocument, handleModifyDocument, handleSaveDocument,
  handleNewDocument, handleSummarizeDocument, handleReviewDocument, 
  userPlan, generationCount, filesUploadedToday, selectedFileName 
}) {
    const fileInputRef = useRef(null); 

  return (
    <div className="w-full flex flex-col space-y-6">
      <div className="relative">
        <textarea
          className="w-full p-4 border border-primary-light rounded-lg focus:ring-2 focus:ring-primary-dark focus:border-transparent text-text-dark placeholder-text-medium min-h-[100px] resize-y shadow-sm font-serif"
          placeholder="Escribe tus instrucciones para la IA aquí (ej: 'Redacta un contrato de alquiler de vivienda para Buenos Aires, con cláusulas de actualización trimestral...')"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          disabled={isLoading}
        ></textarea>
        {promptInput.trim() && ( // Conditionally render Generate button
            <button
              onClick={handleGenerateDocument}
              className="absolute bottom-2 right-2 bg-accent-gold hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 flex items-center justify-center gap-1 text-sm"
              disabled={isLoading}
            >
              {isLoading && <SpinnerIcon />}
              Generar Doc.
            </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 justify-center mb-6">
        {/* Only show these by default */}
        <button
          onClick={handleModifyDocument}
          className="bg-primary-light hover:bg-primary-dark text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-2 flex items-center justify-center gap-2"
          disabled={isLoading}
        >
          {isLoading && <SpinnerIcon />}
          Modificar Doc.
        </button>

        <button
          onClick={handleSaveDocument}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center gap-2"
          disabled={isLoading}
        >
          {isLoading && <SpinnerIcon />}
          Guardar Doc.
        </button>

        <button
          onClick={handleNewDocument}
          className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 flex items-center justify-center gap-2"
          disabled={isLoading}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Nuevo Doc.
        </button>
        
        <button
          onClick={handleSummarizeDocument}
          className="bg-accent-gold hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 flex items-center justify-center gap-2"
          disabled={isLoading || !documentContent.trim()}
        >
          {isLoading && <SpinnerIcon />}
          Resumir Doc. ✨
        </button>

        <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleReviewDocument(e)} 
            style={{ display: 'none' }} 
            accept=".txt,.pdf" 
            disabled={isLoading}
        />
        <button
          onClick={() => { 
            if (fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
          className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-dark focus:ring-offset-2 flex items-center justify-center gap-2"
          disabled={isLoading} 
        >
          {isLoading && <SpinnerIcon />}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.414a2 2 0 00-2.828-2.828L10 9.172m9.172 0a2 2 0 110 2.828L15.414 17.5a2 2 0 01-2.828-2.828L16.172 10m-3.414-4.293a2 2 0 00-2.828 0l-4.586 4.586a2 2 0 102.828 2.828L15.172 7z" />
          </svg>
          Cargar y Revisar Doc. ✨
        </button>
      </div>

      {selectedFileName && ( 
        <p className="text-sm text-text-medium mb-2">Archivo seleccionado: <span className="font-semibold text-primary-dark">{selectedFileName}</span></p>
      )}

      <div className="relative border border-primary-light rounded-xl shadow-inner bg-white">
        <textarea
          className="w-full p-4 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary-dark focus:border-transparent text-text-dark min-h-[400px] resize-y shadow-inner font-serif"
          value={documentContent}
          onChange={(e) => setDocumentContent(e.target.value)}
          placeholder="El documento generado por la IA aparecerá aquí... Puedes editar el texto directamente."
          disabled={isLoading}
        ></textarea>
      </div>
      <p className="text-sm text-text-medium text-center mt-2">
        Plan: <span className="font-semibold text-primary-dark">{userPlan.toUpperCase()}</span> - Generaciones diarias usadas: <span className="font-semibold text-primary-dark">{generationCount}</span> - Archivos revisados hoy: <span className="font-semibold text-primary-dark">{filesUploadedToday}</span>
      </p>
    </div>
  );
}

// AuthPromptForUpgrade Component
function UpgradeAuthPrompt({ onAuthSuccess, onCancel, isLoading, setIsLoading, showMessage, auth, selectedPlanToUpgradeTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false); 

  const handleAuthAction = async () => {
    if (!email || !password) {
      showMessage('Por favor, ingresa un correo electrónico y una contraseña.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      if (isRegistering) {
        let userCredential;
        try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                showMessage('Este correo ya está registrado. Intentando iniciar sesión...', 'info');
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                showMessage('Credenciales inválidas. Verifica tu correo y contraseña o regístrate.', 'error');
                console.error("Error de autenticación:", error);
                throw error; 
            } else {
                console.error("Error en UpgradeAuthPrompt (Registro):", error); 
                throw error; 
            }
        }

        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const credential = EmailAuthProvider.credential(email, password);
            await linkWithCredential(auth.currentUser, credential);
            showMessage('Cuenta anónima vinculada y registrada.', 'success');
        }
        onAuthSuccess(selectedPlanToUpgradeTo); 
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(selectedPlanToUpgradeTo); 
      }
      setEmail(''); 
      setPassword(''); 
    } catch (error) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        showMessage('Credenciales inválidas. Verifica tu correo y contraseña o regístrate.', 'error');
      } else {
        console.error("Error de autenticación al actualizar (Login):", error);
        showMessage(`Error de autenticación: ${error.message}`, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center relative">
        <h3 className="text-2xl font-bold text-primary-dark mb-4">
          {isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'} para tu Plan {selectedPlanToUpgradeTo.toUpperCase()}
        </h3>
        <p className="text-text-medium mb-6">
          Necesitas una cuenta para acceder a las funciones premium.
        </p>
        <input
          type="email"
          placeholder="Correo Electrónico"
          className="w-full p-3 border border-primary-light rounded-lg mb-4 focus:ring-2 focus:ring-primary-dark"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Contraseña"
          className="w-full p-3 border border-primary-light rounded-lg mb-6 focus:ring-2 focus:ring-primary-dark"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleAuthAction}
            className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && <SpinnerIcon />}
            {isRegistering ? 'Registrarse y Continuar' : 'Iniciar Sesión y Continuar'}
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            Cancelar
          </button>
        </div>
        <button
            onClick={() => setIsRegistering(prev => !prev)}
            className="mt-4 text-primary-dark hover:underline text-sm"
            disabled={isLoading}
        >
            {isRegistering ? '¿Ya tienes una cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      </div>
    </div>
  );
};

// AuthView Component - Initial login/register screen
function AuthView({ handleRegister, handleLogin, isLoading, email, setEmail, password, setPassword, showMessage }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <h2 className="text-3xl font-bold text-primary-dark mb-6">Iniciar Sesión o Registrarse</h2>
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <input
          type="email"
          placeholder="Correo Electrónico"
          className="w-full p-3 border border-primary-light rounded-lg mb-4 focus:ring-2 focus:ring-primary-dark"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Contraseña"
          className="w-full p-3 border border-primary-light rounded-lg mb-6 focus:ring-2 focus:ring-primary-dark"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleLogin}
            className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && <SpinnerIcon />}
            Iniciar Sesión
          </button>
          <button
            onClick={handleRegister}
            className="bg-accent-gold hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && <SpinnerIcon />}
            Registrarse
          </button>
        </div>
        <p className="text-sm text-text-medium mt-4 text-center">
          * Para el plan gratuito, puedes usar cualquier correo y contraseña. Si no tienes cuenta, regístrate.
          <br/>
          <strong className="text-red-600">** IMPORTANTE: Si recibes un error "operation-not-allowed", asegúrate de habilitar los métodos de inicio de sesión de "Correo electrónico/Contraseña" y "Anónimo" en la consola de Firebase (Authentication &gt; Sign-in method).</strong>
        </p>
      </div>
    </div>
  );
}

// SubscriptionPlansView Component
function SubscriptionPlansView({ userPlan, handleSelectPlan, isLoading, setCurrentView }) { 
  return (
    <div className="flex flex-col items-center p-4">
      <h2 className="text-3xl font-bold text-primary-dark mb-8 text-center">Nuestros Planes de Suscripción</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">

        {/* Free Plan */}
        <div className={`bg-white p-6 rounded-xl shadow-lg border-2 ${userPlan === 'free' ? 'border-primary-dark' : 'border-gray-200'} flex flex-col items-center text-center`}>
          <h3 className="text-2xl font-bold text-primary-dark mb-2">Plan Gratuito</h3>
          <p className="text-4xl font-extrabold text-primary-dark mb-4">$0 <span className="text-lg text-text-medium">/ mes</span></p>
          <ul className="text-text-dark text-left w-full space-y-2 mb-6">
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> 5 generaciones de documentos diarias</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Acceso al editor de texto plano</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Almacenamiento de documentos limitado</li>
            <li className="flex items-center text-gray-400"><svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg> Sin subida de archivos</li>
          </ul>
          {userPlan === 'free' ? (
             <span className="text-primary-dark font-semibold py-2 px-4 rounded-lg">Plan Actual</span>
          ) : (
            <button
              onClick={() => handleSelectPlan('free')}
              className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 shadow-md"
              disabled={isLoading}
            >
              Seleccionar Plan
            </button>
          )}
        </div>

        {/* Basic Plan */}
        <div className={`bg-white p-6 rounded-xl shadow-lg border-2 ${userPlan === 'basic' ? 'border-primary-dark' : 'border-gray-200'} flex flex-col items-center text-center`}>
          <h3 className="text-2xl font-bold text-primary-dark mb-2">Plan Básico</h3>
          <p className="text-4xl font-extrabold text-primary-dark mb-4">$5 <span className="text-lg text-text-medium">/ mes</span></p>
          <ul className="text-text-dark text-left w-full space-y-2 mb-6">
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> 20 generaciones de documentos diarias</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Acceso ilimitado al editor</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Almacenamiento de documentos ampliado</li>
            <li className="flex items-center text-gray-400"><svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg> Sin subida de archivos</li>
          </ul>
          {userPlan === 'basic' ? (
             <span className="text-primary-dark font-semibold py-2 px-4 rounded-lg">Plan Actual</span>
          ) : (
            <button
              onClick={() => handleSelectPlan('basic')}
              className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 shadow-md"
              disabled={isLoading}
            >
              Seleccionar Plan
            </button>
          )}
        </div>

        {/* Pro Plan */}
        <div className={`bg-white p-6 rounded-xl shadow-lg border-2 ${userPlan === 'pro' ? 'border-primary-dark' : 'border-gray-200'} flex flex-col items-center text-center`}>
          <h3 className="text-2xl font-bold text-primary-dark mb-2">Plan Pro</h3>
          <p className="text-4xl font-extrabold text-primary-dark mb-4">$10 <span className="text-lg text-text-medium">/ mes</span></p>
          <ul className="text-text-dark text-left w-full space-y-2 mb-6">
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Generaciones ilimitadas</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Acceso ilimitado al editor</li>
            <li className="flex items-center"><svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg> Almacenamiento de documentos ilimitado</li>
            <li className="flex items-center text-gray-400"><svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg> Sin subida de archivos</li>
          </ul>
          {userPlan === 'pro' ? (
             <span className="text-primary-dark font-semibold py-2 px-4 rounded-lg">Plan Actual</span>
          ) : (
            <button
              onClick={() => handleSelectPlan('pro')}
              className="bg-primary-dark hover:bg-primary-light text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 shadow-md"
              disabled={isLoading}
            >
              Seleccionar Plan
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => setCurrentView('home')}
        className="mt-8 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-md"
      >
        Volver a Mis Documentos
      </button>
    </div>
  );
}


function App() {
  const [documentContent, setDocumentContent] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info', 'success', 'error'
  const [savedDocuments, setSavedDocuments] = useState([]);
  const [currentView, setCurrentView] = useState('login'); // Start with login view
  const [userPlan, setUserPlan] = useState('free'); // 'free', 'basic', 'pro'
  const [email, setEmail] = useState(''); // State for auth inputs in main App component
  const [password, setPassword] = useState(''); // State for auth inputs in main App component
  const [generationCount, setGenerationCount] = useState(0); // For daily limit concept
  const [filesUploadedToday, setFilesUploadedToday] = useState(0); // New: For daily file upload limit
  const [showUpgradeAuth, setShowUpgradeAuth] = useState(false); // State to control UpgradeAuthPrompt visibility
  const [planToUpgradeTo, setPlanToUpgradeTo] = useState(null); // Which plan is being upgraded to
  const [summaryContent, setSummaryContent] = useState(''); // New state for summary content
  const [showSummaryModal, setShowSummaryModal] = useState(false); // New state to control summary modal visibility
  const [reviewContent, setReviewContent] = useState(''); // New state for AI review content
  const [showReviewModal, setShowReviewModal] = useState(false); // New state to control AI review modal visibility
  const [selectedFileName, setSelectedFileName] = useState(''); // New: State for displaying selected file name
  const [isNavOpen, setIsNavOpen] = useState(false); // NEW: State for hamburger menu
  const [assistantChatHistory, setAssistantChatHistory] = useState([]); // New: Chat history for assistant
  // Moved handleSendAssistantMessage here so it's always defined when passed
  const handleSendAssistantMessage = async (message) => {
    if (!message.trim()) return;

    const newUserMessage = { role: 'user', content: message };
    setAssistantChatHistory(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const assistantResponse = await callGeminiAPI(message, 'assistant');
      if (assistantResponse) {
        setAssistantChatHistory(prev => [...prev, { role: 'model', content: assistantResponse }]);
      } else {
        setAssistantChatHistory(prev => [...prev, { role: 'model', content: 'Lo siento, no pude procesar tu solicitud en este momento. Intenta de nuevo.' }]);
      }
    } catch (error) {
      console.error("Error en la conversación con el asistente:", error);
      setAssistantChatHistory(prev => [...prev, { role: 'model', content: 'Hubo un error al comunicarme con el asistente. Intenta de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };
  const messageTimeoutRef = useRef(null);

  // Clear message after a few seconds
  const showMessage = (msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = setTimeout(() => {
      setMessage('');
    }, 5000); // Message disappears after 5 seconds
  };

  // Initialize Firebase and set up authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          showMessage(`Sesión iniciada.`, 'success');
          fetchUserPlan(user.uid);
          setCurrentView('home'); // Go to home after any successful authentication
        } else {
          // If no user, set current view to login
          setCurrentView('login');
          setUserId(null);
          setUserPlan('free');
          setGenerationCount(0);
          setFilesUploadedToday(0); // Reset file upload count
        }
      });
      return () => unsubscribe(); // Cleanup auth listener
    } catch (error) {
      console.error("Error al inicializar Firebase:", error);
      showMessage(`Error al inicializar la aplicación: ${error.message}`, 'error');
    }
  }, []);

  // Fetch user plan from Firestore
  const fetchUserPlan = async (uid) => {
      if (!db) return;
      try {
          const userPlanDocRef = doc(db, `artifacts/${myAppId}/user_plans/${uid}`);
          const docSnap = await getDoc(userPlanDocRef);
          if (docSnap.exists()) {
              const planData = docSnap.data();
              setUserPlan(planData.plan || 'free');
              let currentGenCount = planData.generationCount || 0;
              let currentFilesUploaded = planData.filesUploadedToday || 0;

              // Reset counts daily if it's a new day
              const lastActivityDate = planData.lastActivityDate?.toDate();
              if (lastActivityDate && lastActivityDate.toDateString() !== new Date().toDateString()) {
                  currentGenCount = 0;
                  currentFilesUploaded = 0;
                  await setDoc(userPlanDocRef, { generationCount: 0, filesUploadedToday: 0, lastActivityDate: serverTimestamp() }, { merge: true });
              } else {
                  // Only update if lastActivityDate is not set or not a new day
                  await setDoc(userPlanDocRef, { lastActivityDate: serverTimestamp() }, { merge: true });
              }
              setGenerationCount(currentGenCount);
              setFilesUploadedToday(currentFilesUploaded);
          } else {
              setUserPlan('free'); // Default to free if no plan saved
              await setDoc(userPlanDocRef, { plan: 'free', generationCount: 0, filesUploadedToday: 0, lastActivityDate: serverTimestamp(), createdAt: serverTimestamp() });
              setGenerationCount(0); 
              setFilesUploadedToday(0);
          }
      } catch (error) {
          console.error("Error fetching user plan:", error);
          setUserPlan('free'); // Fallback
          setGenerationCount(0);
          setFilesUploadedToday(0);
      }
  };

  // Fetch and listen for saved documents when authenticated
  useEffect(() => {
    if (db && userId) {
      const userDocsCollectionRef = collection(db, `artifacts/${myAppId}/users/${userId}/legal_documents`);
      const q = query(userDocsCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const docsList = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.lastModifiedAt?.toDate() || 0) - (a.lastModifiedAt?.toDate() || 0)); // Client-side sort
          setSavedDocuments(docsList);
          showMessage(`Se cargaron ${docsList.length} documentos guardados.`, 'info');
        } else {
          setSavedDocuments([]);
          showMessage('No hay documentos guardados. ¡Empieza a generar uno!', 'info');
        }
      }, (error) => {
        console.error("Error al obtener documentos en tiempo real:", error);
        showMessage(`Error al cargar documentos: ${error.message}`, 'error');
      });

      return () => unsubscribe(); // Cleanup snapshot listener
    }
  }, [db, userId]);

  // Auth functions (defined within App component scope)
  const handleRegister = async () => {
    if (!email || !password) {
      showMessage('Por favor, ingresa un correo electrónico y una contraseña para registrarte.', 'error');
      return;
    }
    setIsLoading(true);
    showMessage('Registrando usuario...', 'info');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      setUserId(userCredential.user.uid);
      await setDoc(doc(db, `artifacts/${myAppId}/user_plans/${userCredential.user.uid}`), { plan: 'free', generationCount: 0, filesUploadedToday: 0, lastActivityDate: serverTimestamp(), createdAt: serverTimestamp() });
      setUserPlan('free');
      setFilesUploadedToday(0); // Reset local count
      showMessage('Registro exitoso. ¡Bienvenido!', 'success');
      setCurrentView('home');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        showMessage('Este correo ya está registrado. Por favor, inicia sesión o usa otro correo.', 'error');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        showMessage('Credenciales inválidas. Verifica tu correo y contraseña o regístrate.', 'error');
      } else {
        console.error("Error en el registro:", error);
        showMessage(`Error en el registro: ${error.message}`, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showMessage('Por favor, ingresa tu correo electrónico y una contraseña para iniciar sesión.', 'error');
      return;
    }
    setIsLoading(true);
    showMessage('Iniciando sesión...', 'info');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUserId(userCredential.user.uid);
      fetchUserPlan(userCredential.user.uid);
      showMessage('Sesión iniciada correctamente.', 'success');
      setCurrentView('home');
    } catch (error) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        showMessage('Credenciales inválidas. Verifica tu correo y contraseña o regístrate.', 'error');
      } else {
        console.error("Error al iniciar sesión:", error);
        showMessage(`Error al iniciar sesión: ${error.message}`, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };


  const handleLogout = async () => {
    setIsLoading(true);
    showMessage('Cerrando sesión...', 'info');
    try {
      await signOut(auth);
      setUserId(null);
      setEmail('');
      setPassword('');
      setUserPlan('free'); // Reset plan on logout
      setGenerationCount(0); // Reset count on logout
      setFilesUploadedToday(0); // Reset file upload count
      showMessage('Sesión cerrada. Puedes iniciar sesión o registrarte nuevamente.', 'info');
      setCurrentView('login'); // Go back to login screen after logout
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      showMessage(`Error al cerrar sesión: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = async (plan) => {
      if (!userId || !db || !auth) {
          showMessage('Error: No se pudo verificar el estado de autenticación. Intenta recargar la página.', 'error');
          return;
      }

      // If user is already on the selected plan
      if (userPlan === plan) {
          showMessage(`Ya estás en el plan ${plan.toUpperCase()}.`, 'info');
          setCurrentView('home');
          return;
      }
      
      // If user is anonymous and trying to get a paid plan
      if (auth.currentUser.isAnonymous && (plan === 'basic' || plan === 'pro')) {
          setPlanToUpgradeTo(plan);
          setShowUpgradeAuth(true); // Show the authentication prompt for upgrade
          return; // Stop here, wait for auth prompt completion
      }

      // If user is already authenticated with email/password, or selecting free plan
      setIsLoading(true);
      try {
          const userPlanDocRef = doc(db, `artifacts/${myAppId}/user_plans/${userId}`);
          await setDoc(userPlanDocRef, { plan: plan, lastModifiedAt: serverTimestamp() }, { merge: true });
          setUserPlan(plan);
          setGenerationCount(0); // Reset generation count when plan changes
          setFilesUploadedToday(0); // Reset file upload count when plan changes
          showMessage(`Plan "${plan}" seleccionado con éxito.`, 'success');
          setCurrentView('home'); // Go to home after selecting plan
      } catch (error) {
          console.error("Error al seleccionar plan:", error);
          showMessage(`Error al seleccionar plan: ${error.message}`, 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleUpgradeAuthSuccess = async (plan) => {
    setShowUpgradeAuth(false); // Hide the modal
    setIsLoading(true);
    try {
        const userPlanDocRef = doc(db, `artifacts/${myAppId}/user_plans/${auth.currentUser.uid}`);
        await setDoc(userPlanDocRef, { plan: plan, lastModifiedAt: serverTimestamp() }, { merge: true });
        setUserPlan(plan);
        setGenerationCount(0);
        setFilesUploadedToday(0); // Reset file count after upgrade
        showMessage(`¡Bienvenido al plan ${plan.toUpperCase()}!`, 'success');
        setCurrentView('home');
        setUserId(auth.currentUser.uid); // Ensure userId is updated if linking occurred
        fetchUserPlan(auth.currentUser.uid);
    } catch (error) {
        console.error("Error al finalizar la actualización del plan después de la autenticación:", error);
        showMessage(`Error al actualizar plan después de la autenticación: ${error.message}`, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleUpgradeAuthCancel = () => {
      setShowUpgradeAuth(false); // Hide the modal
      showMessage('Selección de plan cancelada.', 'info');
  };

  // Conceptual daily generation limits
  const checkGenerationLimit = () => {
    const limits = {
      'free': 5,
      'basic': 20, // More than free, but still limited
      'pro': Infinity // No limit
    };
    if (generationCount >= limits[userPlan]) {
      showMessage(`Has alcanzado el límite diario de ${limits[userPlan]} generaciones para tu plan "${userPlan}". Considera actualizar tu plan.`, 'error');
      return false;
    }
    return true;
  };

  const incrementGenerationCount = async () => {
    setGenerationCount(prev => prev + 1);
    if (db && userId) {
        try {
            const userPlanDocRef = doc(db, `artifacts/${myAppId}/user_plans/${userId}`);
            await setDoc(userPlanDocRef, { generationCount: generationCount + 1, lastActivityDate: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.error("Error al actualizar el contador de generaciones:", error);
        }
    }
  };

  // Conceptual daily file upload limits
  const checkFileUploadLimit = () => {
    const limits = {
      'free': 5,
      'basic': 10,
      'pro': Infinity
    };
    if (filesUploadedToday >= limits[userPlan]) {
      showMessage(`Has alcanzado el límite diario de ${limits[userPlan]} archivos revisados para tu plan "${userPlan}". Considera actualizar tu plan.`, 'error');
      return false;
    }
    return true;
  };

  const incrementFilesUploaded = async () => {
    setFilesUploadedToday(prev => prev + 1);
    if (db && userId) {
        try {
            const userPlanDocRef = doc(db, `artifacts/${myAppId}/user_plans/${userId}`);
            await setDoc(userPlanDocRef, { filesUploadedToday: filesUploadedToday + 1, lastActivityDate: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.error("Error al actualizar el contador de archivos revisados:", error);
        }
    }
  };


  // Function to call the Gemini API for various purposes
  const callGeminiAPI = async (prompt, type = 'generate', currentDoc = '') => {
    if (!auth || !auth.currentUser || !userId) {
      showMessage('Necesitas estar autenticado para usar la IA. Por favor, inicia sesión.', 'error');
      setCurrentView('login');
      return null; // Return null to indicate failure
    }

    // Check specific limits based on AI call type
    if (type === 'generate' || type === 'modify') {
      if (!checkGenerationLimit()) return null;
    } else if (type === 'summarize' || type === 'review' || type === 'assistant') { // Added 'assistant' type to limit
      if (!checkFileUploadLimit()) return null; // Use file upload limit for review/summarize/assistant
    }

    setIsLoading(true);
    showMessage('Generando contenido con IA...', 'info');
    let promptToSend = '';

    // Adjust prompt based on type of AI call
    if (type === 'generate') {
      promptToSend = `Genera un documento legal en español para Argentina basándose en la siguiente instrucción. Asegúrate de que el contenido sea preciso y se ajuste a la terminología jurídica argentina. Responde únicamente con texto plano, sin etiquetas HTML o formato especial. Proporciona el texto completo del documento:\n\n"${prompt}"`;
    } else if (type === 'modify') {
      promptToSend = `Dado el siguiente documento legal (texto plano): \n\n"""\n${currentDoc}\n"""\n\nPor favor, modifica, revisa, extiende o continúa este documento basándote en la siguiente instrucción. Responde únicamente con texto plano, sin etiquetas HTML o formato especial:\n\n"${prompt}"`;
    } else if (type === 'summarize') {
      promptToSend = `Por favor, proporciona un resumen conciso y claro del siguiente documento legal. Enfócate en los puntos clave, las partes involucradas y las acciones principales. Responde únicamente con texto plano, sin etiquetas HTML o formato especial:\n\n"""\n${prompt}\n"""`;
    } else if (type === 'review') { 
      promptToSend = `Eres un asistente legal en Argentina. Revisa el siguiente documento legal (texto plano) y proporciona consejos o mejoras. Identifica posibles errores, ambigüedades, áreas de optimización, o sugerencias para mayor claridad o cumplimiento legal. Responde únicamente con texto plano:\n\n"""\n${prompt}\n"""`;
    } else if (type === 'assistant') { // NEW: Assistant prompt
        promptToSend = `Eres un asistente virtual de la aplicación LegalDocs AI, especializada en documentos legales para Argentina. Tu propósito es ayudar a los usuarios con preguntas relacionadas con la aplicación, su funcionamiento, los planes de suscripción, cómo generar/modificar/resumir/revisar documentos, o consejos generales sobre la redacción legal en Argentina.

        **Instrucciones clave:**
        - Sé conciso, útil y profesional.
        - Si la pregunta no está relacionada con la aplicación o con el ámbito legal (ej. "cuál es la capital de Francia", "cuéntame un chiste"), responde amablemente pidiendo que el usuario se centre en temas relevantes. No actúes como un chatbot de propósito general.
        - No generes documentos legales completos ni des asesoramiento legal específico, solo guía y consejos generales sobre el uso de la app o el ámbito legal.

        **Conversación del usuario:**\n\n"${prompt}"`;
    }


    try {
      let chatHistory = [{ role: "user", parts: [{ text: promptToSend }] }];
      const payload = { contents: chatHistory };
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // Using API key from .env

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Error de la API de Gemini: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        // Increment specific counter based on type
        if (type === 'generate' || type === 'modify') {
            incrementGenerationCount();
        } else if (type === 'summarize' || type === 'review' || type === 'assistant') { // Increment for assistant too
            incrementFilesUploaded(); 
        }
        showMessage('Contenido generado/modificado con éxito.', 'success');
        return text; 
      } else {
        showMessage('No se pudo generar contenido. La respuesta de la IA fue inesperada.', 'error');
        console.error('Respuesta inesperada de la API de Gemini:', result);
        return null;
      }
    } catch (error) {
      console.error("Error al llamar a la API de Gemini:", error);
      showMessage(`Error al interactuar con la IA: ${error.message}. Por favor, inténtalo de nuevo.`, 'error');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // New handleReviewDocument function (file upload)
  const handleReviewDocument = async (event) => {
      const file = event.target.files[0];
      if (!file) {
          showMessage('Ningún archivo seleccionado.', 'info');
          setSelectedFileName(''); // Clear previous file name
          return;
      }

      setSelectedFileName(file.name); // Display the selected file name

      if (file.type === 'application/pdf') {
          if (!checkFileUploadLimit()) {
            event.target.value = ''; 
            return;
          }
          showMessage('Procesando PDF... Esto puede tomar un momento.', 'info');
          
          const reader = new FileReader();
          reader.onload = async (e) => {
              try {
                  const data = new Uint8Array(e.target.result);
                  const pdf = await pdfjsLib.getDocument({ data: data }).promise; // Use pdfjsLib to get document
                  let fullText = '';
                  for (let i = 0; i < pdf.numPages; i++) {
                      const page = await pdf.getPage(i + 1);
                      const textContent = await page.getTextContent();
                      fullText += textContent.items.map(s => s.str).join(' ');
                  }

                  if (!fullText.trim()) {
                      showMessage('El archivo PDF está vacío o no se pudo extraer texto.', 'info');
                      setSelectedFileName(''); 
                      return;
                  }
                  
                  setShowReviewModal(true); 
                  setReviewContent(''); 
                  const review = await callGeminiAPI(fullText, 'review'); 
                  if (review) {
                      setReviewContent(review);
                  } else {
                      setReviewContent('No se pudo generar la revisión del documento desde el PDF.');
                  }
              } catch (pdfError) {
                  console.error("Error al procesar PDF:", pdfError);
                  showMessage(`Error al procesar el archivo PDF: ${pdfError.message}. Asegúrate de que sea un PDF válido y legible.`, 'error');
                  setSelectedFileName(''); 
              }
          };
          reader.readAsArrayBuffer(file);
          event.target.value = ''; 
          return; 

      } else if (file.type !== 'text/plain') {
          showMessage('Solo se permiten archivos de texto plano (.txt) o PDF para la revisión.', 'error');
          event.target.value = ''; 
          return;
      }

      // Handle .txt files
      const reader = new FileReader();
      reader.onload = async (e) => {
          const fileContent = e.target.result;
          if (!fileContent.trim()) {
              showMessage('El archivo está vacío. No hay nada que revisar.', 'info');
              setSelectedFileName(''); 
              return;
          }
          setShowReviewModal(true); 
          setReviewContent(''); 
          const review = await callGeminiAPI(fileContent, 'review');
          if (review) {
              setReviewContent(review);
          } else {
              setReviewContent('No se pudo generar la revisión del documento.');
          }
      };
      reader.readAsText(file);
      event.target.value = ''; 
  };


  const handleSaveDocument = async () => {
    if (!db || !userId) {
      showMessage('Firebase no está inicializado o el usuario no está autenticado.', 'error');
      return;
    }
    if (!documentContent.trim()) {
      showMessage('El documento está vacío. No se puede guardar.', 'info');
      return;
    }
    setIsLoading(true);
    showMessage('Guardando documento...', 'info');
    try {
      const title = getDocumentTitle(documentContent);
      const docRef = doc(collection(db, `artifacts/${myAppId}/users/${userId}/legal_documents`));
      await setDoc(docRef, {
        content: documentContent,
        title: title,
        createdAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
      });
      setDocumentContent('');
      setPromptInput('');
      setSelectedFileName(''); 
      showMessage('Documento guardado con éxito. ¡Empieza un nuevo documento!', 'success');
    } catch (error) {
      console.error("Error al guardar el documento:", error);
      showMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // New handleDeleteDocument function
  const handleDeleteDocument = async (docId) => {
    if (!db || !userId) {
      showMessage('Error de autenticación al intentar eliminar.', 'error');
      return;
    }
    if (!window.confirm('¿Estás seguro de que quieres eliminar este documento? Esta acción no se puede deshacer.')) {
      return;
    }
    setIsLoading(true);
    showMessage('Eliminando documento...', 'info');
    try {
      await deleteDoc(doc(db, `artifacts/${myAppId}/users/${userId}/legal_documents`, docId));
      showMessage('Documento eliminado con éxito.', 'success');
    } catch (error) {
      console.error("Error al eliminar documento:", error);
      showMessage(`Error al eliminar documento: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Modified handleGenerateDocument to use the new callGeminiAPI
  const handleGenerateDocument = async () => {
    if (!promptInput.trim()) {
      showMessage('Por favor, ingresa un prompt para generar el documento.', 'info');
      return;
    }
    const generatedText = await callGeminiAPI(promptInput, 'generate');
    if (generatedText) {
      setDocumentContent(generatedText);
    }
  };

  // Modified handleModifyDocument to use the new callGeminiAPI
  const handleModifyDocument = async () => {
    if (!promptInput.trim()) {
      showMessage('Por favor, ingresa un prompt para modificar el documento.', 'info');
      return;
    }
    if (!documentContent.trim()) {
      showMessage('El documento está vacío. Por favor, genera un documento primero o carga uno existente para modificar.', 'info');
      return;
    }
    const modifiedText = await callGeminiAPI(documentContent, 'modify', documentContent);
    if (modifiedText) {
      setDocumentContent(modifiedText);
    }
  };

  // New handleSummarizeDocument function
  const handleSummarizeDocument = async () => {
    if (!documentContent.trim()) {
      showMessage('El documento está vacío. No hay nada que resumir.', 'info');
      return;
    }
    setShowSummaryModal(true); // Show modal immediately with loading state
    setSummaryContent(''); // Clear previous summary
    const summary = await callGeminiAPI(documentContent, 'summarize');
    if (summary) {
      setSummaryContent(summary);
    } else {
      setSummaryContent('No se pudo generar el resumen.');
    }
  };


  const handleLoadDocument = (docToLoad) => {
    setDocumentContent(docToLoad.content);
    setPromptInput('');
    setSelectedFileName(''); // Clear selected file name when loading a saved doc
    showMessage(`Documento "${docToLoad.title || 'sin título'}" cargado.`, 'success');
    setCurrentView('editor');
  };

  const handleNewDocument = () => {
    setDocumentContent('');
    setPromptInput('');
    setSelectedFileName(''); // Clear selected file name for new document
    showMessage('Nuevo documento creado. ¡Empieza a escribir!', 'info');
    setCurrentView('editor');
  };

  // Tailwind classes for message types
  const messageClasses = {
    info: 'bg-blue-100 border-blue-400 text-blue-700',
    success: 'bg-green-100 border-green-400 text-green-700',
    error: 'bg-red-100 border-red-400 text-red-700',
  };

  // --- Main Render Logic ---
  return (
    <div className="min-h-screen bg-bg-page p-4 font-sans flex flex-col items-center overflow-x-hidden">
      {/* Drawer Overlay */}
      {isNavOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-40 md:hidden" onClick={() => setIsNavOpen(false)}></div>
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 h-full bg-white shadow-xl z-50 transform transition-transform duration-300 ${isNavOpen ? 'translate-x-0' : '-translate-x-full'} w-64 p-6 md:hidden flex flex-col`}>
        <button className="self-end text-primary-dark text-2xl mb-6" onClick={() => setIsNavOpen(false)}>
          &times;
        </button>
        <nav className="flex flex-col space-y-4">
          <button
            onClick={() => { setCurrentView('editor'); setIsNavOpen(false); }}
            className="text-left text-lg text-primary-dark hover:text-primary-light font-semibold py-2 px-3 rounded-lg"
          >
            Editor de Documentos
          </button>
          <button
            onClick={() => { setCurrentView('home'); setIsNavOpen(false); }}
            className="text-left text-lg text-primary-dark hover:text-primary-light font-semibold py-2 px-3 rounded-lg"
          >
            Mis Documentos
          </button>
          <button
            onClick={() => { setCurrentView('subscriptions'); setIsNavOpen(false); }}
            className="text-left text-lg text-primary-dark hover:text-primary-light font-semibold py-2 px-3 rounded-lg"
          >
            Planes de Suscripción
          </button>
          <button
            onClick={() => { setCurrentView('assistant-chat'); setIsNavOpen(false); }} 
            className="text-left text-lg text-primary-dark hover:text-primary-light font-semibold py-2 px-3 rounded-lg"
          >
            Asistente AI
          </button>
        </nav>
      </div>

      <div className="w-full max-w-6xl bg-white rounded-xl shadow-lg p-6 space-y-6 flex flex-col">
        {/* Header with main title and logo */}
        <div className="w-full flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3 flex-grow">
            {/* Hamburger Menu Button (visible on mobile) */}
            <button className="md:hidden text-primary-dark text-3xl p-2" onClick={() => setIsNavOpen(!isNavOpen)}>
              &#9776; {/* Hamburger icon */}
            </button>
            {/* Logo */}
            <img src="/image_a8a856.png" alt="LegalDocs AI Logo" className="h-12 w-auto" onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/100x48/CCCCCC/000000?text=LegalDocs+AI"; showMessage('Error al cargar el logo. Asegúrate de que "image_a8a856.png" esté en la carpeta public/.', 'error'); }} />
            <h1 className="text-4xl font-extrabold text-primary-dark hidden md:block font-sans">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-dark to-accent-gold">
                LegalDocs IA 🇦🇷
              </span>
            </h1>
          </div>
          {auth && auth.currentUser && ( 
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 shadow-md text-sm"
              disabled={isLoading}
            >
              Cerrar Sesión
            </button>
          )}
        </div>

        {/* Message display (always visible) */}
        {message && (
          <div className={`transition-opacity duration-500 ease-in-out px-4 py-3 rounded-lg relative text-center border ${messageClasses[messageType]} shadow-md`} role="alert">
            <span className="block sm:inline font-medium">{message}</span>
          </div>
        )}

        {/* Upgrade Auth Prompt Modal */}
        {showUpgradeAuth && (
            <UpgradeAuthPrompt
                onAuthSuccess={handleUpgradeAuthSuccess}
                onCancel={handleUpgradeAuthCancel}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                showMessage={showMessage}
                                auth={auth} // Pass auth to UpgradeAuthPrompt
                selectedPlanToUpgradeTo={planToUpgradeTo}
            />
        )}

        {/* Summary Modal */}
        {showSummaryModal && (
            <SummaryModal
                summaryContent={summaryContent}
                onClose={() => setShowSummaryModal(false)}
                isLoading={isLoading} 
            />
        )}

        {/* Review Modal */}
        {showReviewModal && (
            <ReviewModal
                reviewContent={reviewContent}
                onClose={() => setShowReviewModal(false)}
                isLoading={isLoading} 
            />
        )}

        {/* Assistant Chat Modal - Now conditionally rendered as a main view */}
        {currentView === 'assistant-chat' && (
          <AssistantChatModal
            chatHistory={assistantChatHistory}
            onSendMessage={handleSendAssistantMessage} 
            onClose={() => setCurrentView('home')} 
            isLoading={isLoading}
          />
        )}


        {currentView === 'login' && (
          <AuthView
            handleRegister={handleRegister}
            handleLogin={handleLogin}
            isLoading={isLoading}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showMessage={showMessage}
          />
        )}

        {userId && currentView !== 'login' && currentView !== 'assistant-chat' && ( 
          <>
            {/* Main Navigation buttons (hidden on mobile, shown by hamburger) */}
            <div className="w-full flex flex-wrap gap-4 justify-center mb-6 hidden md:flex">
              <button
                onClick={() => setCurrentView('editor')}
                className={`py-2 px-6 rounded-lg font-semibold transition-colors duration-200 shadow-md ${currentView === 'editor' ? 'bg-primary-dark text-white' : 'bg-gray-200 text-text-dark hover:bg-gray-300'}`}
              >
                Editor de Documentos
              </button>
              <button
                onClick={() => setCurrentView('home')}
                className={`py-2 px-6 rounded-lg font-semibold transition-colors duration-200 shadow-md ${currentView === 'home' ? 'bg-primary-dark text-white' : 'bg-gray-200 text-text-dark hover:bg-gray-300'}`}
              >
                Mis Documentos
              </button>
              <button
                onClick={() => setCurrentView('subscriptions')}
                className={`py-2 px-6 rounded-lg font-semibold transition-colors duration-200 shadow-md ${currentView === 'subscriptions' ? 'bg-primary-dark text-white' : 'bg-gray-200 text-text-dark hover:bg-gray-300'}`}
              >
                Planes de Suscripción
              </button>
              <button
                onClick={() => setCurrentView('assistant-chat')}
                className={`py-2 px-6 rounded-lg font-semibold transition-colors duration-200 shadow-md ${currentView === 'assistant-chat' ? 'bg-primary-dark text-white' : 'bg-gray-200 text-text-dark hover:bg-gray-300'}`}
              >
                Asistente AI
              </button>
            </div>
          </>
        )}

        {userId && currentView === 'editor' && (
          <DocumentEditor
              documentContent={documentContent}
              setDocumentContent={setDocumentContent}
              promptInput={promptInput}
              setPromptInput={setPromptInput}
              isLoading={isLoading}
              handleGenerateDocument={handleGenerateDocument}
              handleModifyDocument={handleModifyDocument}
              handleSaveDocument={handleSaveDocument}
              handleNewDocument={handleNewDocument}
              handleSummarizeDocument={handleSummarizeDocument} 
              handleReviewDocument={handleReviewDocument} 
              userPlan={userPlan}
              generationCount={generationCount}
              filesUploadedToday={filesUploadedToday} 
              selectedFileName={selectedFileName} 
          />
        )}

        {userId && currentView === 'home' && (
          <div className="w-full bg-bg-light p-4 rounded-xl shadow-inner flex flex-col">
            <h2 className="text-2xl font-bold text-primary-dark mb-4 text-center">Mis Documentos Guardados</h2>
            <div className="overflow-y-auto max-h-[calc(100vh-250px)] pr-2">
              {savedDocuments.length > 0 ? (
                <ul className="space-y-3">
                  {savedDocuments.map((doc) => (
                    <li key={doc.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between items-start">
                      <div className="flex-grow">
                        <p className="font-semibold text-primary-dark text-lg mb-1 font-serif">{doc.title || getDocumentTitle(doc.content)}</p>
                        {doc.lastModifiedAt && (
                          <p className="text-text-medium text-sm font-serif">
                            Última modif.: {new Date(doc.lastModifiedAt.toDate()).toLocaleString()}
                          </p>
                        )}
                        <p className="text-text-dark text-sm mt-1 line-clamp-2 font-serif">{doc.content}</p>
                      </div>
                      <button
                        onClick={() => handleLoadDocument(doc)}
                        className="mt-3 bg-primary-dark hover:bg-primary-light text-white text-sm font-medium py-2 px-4 rounded-md transition-colors duration-200 shadow-sm"
                        disabled={isLoading}
                      >
                        Cargar Documento
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)} 
                        className="mt-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors duration-200 shadow-sm"
                        disabled={isLoading}
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-medium text-center py-8">Aún no tienes documentos guardados. ¡Ve al editor para crear uno!</p>
              )}
            </div>
          </div>
        )}

        {userId && currentView === 'subscriptions' && <SubscriptionPlansView userPlan={userPlan} handleSelectPlan={handleSelectPlan} isLoading={isLoading} setCurrentView={setCurrentView} />}


        {userId && (
          <div className="text-sm text-text-medium text-center mt-6 p-3 bg-white rounded-lg shadow-md max-w-4xl w-full break-all">
            Tu ID de Usuario: <span className="font-mono bg-gray-200 px-2 py-1 rounded-md text-primary-dark select-all">{userId}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
