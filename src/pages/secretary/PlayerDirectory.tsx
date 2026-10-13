import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Player, PlayerPosition } from '../../types/database.types';

export const PlayerDirectory: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [program, setProgram] = useState('MBBS');
  const [currentClass, setCurrentClass] = useState('3rd Year');
  const [position, setPosition] = useState<PlayerPosition>('Midfielder');
  const [shirtNumber, setShirtNumber] = useState<number>(10);
  const [injuryStatus, setInjuryStatus] = useState<'Fit' | 'Injured' | 'Recovering'>('Fit');

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    const { data, error } = await supabase.from('players').select('*');
    if (error) console.error('Error loading players:', error);
    else setPlayers(data || []);
  };

  const handleRegisterPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;

    const { error } = await supabase.from('players').insert([
      {
        full_name: fullName,
        student_id: studentId,
        academic_program: program,
        current_class: currentClass,
        position,
        shirt_number: Number(shirtNumber),
        injury_status: injuryStatus,
        university_id: '11111111-1111-1111-1111-111111111111'
      }
    ]);

    if (error) {
      alert('Error registering player: ' + error.message);
    } else {
      setFullName('');
      setStudentId('');
      fetchPlayers();
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Student Player Directory</h1>

      {/* Registration Form */}
      <form onSubmit={handleRegisterPlayer} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            placeholder="Player Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
          <input
            type="text"
            placeholder="e.g. ST-2026-88"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Academic Program & Class</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="MBBS"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="w-1/2 border border-gray-300 rounded-md p-2 text-sm"
            />
            <input
              type="text"
              placeholder="3rd Year"
              value={currentClass}
              onChange={(e) => setCurrentClass(e.target.value)}
              className="w-1/2 border border-gray-300 rounded-md p-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Position & Shirt #</label>
          <div className="flex gap-2">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as PlayerPosition)}
              className="w-2/3 border border-gray-300 rounded-md p-2 text-sm"
            >
              <option value="Goalkeeper">Goalkeeper</option>
              <option value="Defender">Defender</option>
              <option value="Midfielder">Midfielder</option>
              <option value="Forward">Forward</option>
            </select>
            <input
              type="number"
              value={shirtNumber}
              onChange={(e) => setShirtNumber(Number(e.target.value))}
              className="w-1/3 border border-gray-300 rounded-md p-2 text-sm"
            />
          </div>
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="submit"
            className="bg-emerald-600 text-white font-medium py-2 px-6 rounded-md hover:bg-emerald-700 transition"
          >
            Register Student Player
          </button>
        </div>
      </form>

      {/* Players Table */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Player</th>
              <th className="px-6 py-3 text-left">Program / Class</th>
              <th className="px-6 py-3 text-left">Position</th>
              <th className="px-6 py-3 text-left">Shirt #</th>
              <th className="px-6 py-3 text-left">Injury Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {players.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4 font-medium text-gray-900">{p.full_name}</td>
                <td className="px-6 py-4 text-gray-600">{p.academic_program} - {p.current_class}</td>
                <td className="px-6 py-4 text-gray-600">{p.position}</td>
                <td className="px-6 py-4 text-gray-600">#{p.shirt_number}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded-full font-semibold ${
                    p.injury_status === 'Fit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {p.injury_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
