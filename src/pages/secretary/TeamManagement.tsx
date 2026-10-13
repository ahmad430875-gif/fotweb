import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase'; // Assuming your supabase client is here
import { Team, TeamType } from '../../types/database.types';

export const TeamManagement: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamType, setTeamType] = useState<TeamType>('University Team');
  const [season, setSeason] = useState('2026/2027');
  const [coachName, setCoachName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    const { data, error } = await supabase.from('teams').select('*');
    if (error) console.error('Error fetching teams:', error);
    else setTeams(data || []);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName) return;
    setLoading(true);

    const { error } = await supabase.from('teams').insert([
      {
        name: teamName,
        team_type: teamType,
        season,
        coach_name: coachName,
        university_id: '11111111-1111-1111-1111-111111111111' // Replace with dynamic secretary university ID
      }
    ]);

    setLoading(false);
    if (error) {
      alert('Error creating team: ' + error.message);
    } else {
      setTeamName('');
      setCoachName('');
      fetchTeams();
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">University & Class Team Management</h1>
      
      {/* Create Team Form */}
      <form onSubmit={handleCreateTeam} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
          <input
            type="text"
            placeholder="e.g., University First XI or MBBS 3rd Year"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Team Type</label>
          <select
            value={teamType}
            onChange={(e) => setTeamType(e.target.value as TeamType)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
          >
            <option value="University Team">University Team</option>
            <option value="Class Team">Class Team</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Coach / Manager</label>
          <input
            type="text"
            placeholder="Coach Name"
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 transition"
          >
            {loading ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </form>

      {/* Teams Grid */}
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Active Teams</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {teams.map((team) => (
          <div key={team.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <span className="inline-block px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full mb-2">
              {team.team_type}
            </span>
            <h3 className="text-lg font-bold text-gray-900">{team.name}</h3>
            <p className="text-sm text-gray-600 mt-1">Season: {team.season}</p>
            {team.coach_name && <p className="text-sm text-gray-600">Coach: {team.coach_name}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
